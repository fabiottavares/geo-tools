import type { Feature, Geometry, Polygon } from 'geojson'
import { kml } from '@tmcw/togeojson'
import JSZip from 'jszip'
import { parse as parseWkt } from 'wellknown'
import shp from 'shpjs'

export type ImportFormat = 'geojson' | 'kml' | 'kmz' | 'wkt' | 'shp'

export const IMPORT_FORMATS: Record<
  ImportFormat,
  { label: string; extensions: string[] }
> = {
  geojson: { label: 'GeoJSON', extensions: ['geojson', 'json'] },
  kml: { label: 'KML', extensions: ['kml'] },
  kmz: { label: 'KMZ', extensions: ['kmz'] },
  wkt: { label: 'WKT', extensions: ['wkt', 'txt'] },
  shp: { label: 'Shapefile (.zip)', extensions: ['zip'] },
}

export const ACCEPT = Object.values(IMPORT_FORMATS)
  .flatMap((f) => f.extensions.map((e) => `.${e}`))
  .join(',')

export const MAX_FILE_BYTES = 500 * 1024 * 1024

export type ImportResult = {
  format: ImportFormat
  features: Feature<Polygon>[]
  /** Geometrias ignoradas (pontos, linhas, inválidas) */
  skipped: number
}

export function detectFormat(filename: string): ImportFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  for (const [format, { extensions }] of Object.entries(IMPORT_FORMATS)) {
    if (extensions.includes(ext)) return format as ImportFormat
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Normalização: qualquer GeoJSON -> lista de Polygon                  */
/* ------------------------------------------------------------------ */

const isValidRing = (ring: unknown): boolean =>
  Array.isArray(ring) &&
  ring.length >= 4 &&
  ring.every(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  )

const isValidPolygon = (coords: unknown): boolean =>
  Array.isArray(coords) && coords.length > 0 && coords.every(isValidRing)

type Stats = { polygons: Feature<Polygon>[]; skipped: number }

function collectGeometry(
  geom: Geometry | null | undefined,
  properties: Feature['properties'],
  stats: Stats,
) {
  if (!geom) {
    stats.skipped++
    return
  }
  switch (geom.type) {
    case 'Polygon':
      if (isValidPolygon(geom.coordinates)) {
        stats.polygons.push({ type: 'Feature', properties, geometry: geom })
      } else stats.skipped++
      break
    case 'MultiPolygon':
      for (const coordinates of geom.coordinates) {
        if (isValidPolygon(coordinates)) {
          stats.polygons.push({
            type: 'Feature',
            properties,
            geometry: { type: 'Polygon', coordinates },
          })
        } else stats.skipped++
      }
      break
    case 'GeometryCollection':
      geom.geometries.forEach((g) => collectGeometry(g, properties, stats))
      break
    default:
      stats.skipped++
  }
}

function collect(input: unknown, stats: Stats) {
  if (Array.isArray(input)) {
    input.forEach((i) => collect(i, stats))
    return
  }
  if (!input || typeof input !== 'object') return
  const obj = input as { type?: string }

  if (obj.type === 'FeatureCollection') {
    ; (obj as { features: Feature[] }).features.forEach((f) => collect(f, stats))
  } else if (obj.type === 'Feature') {
    const f = obj as Feature
    collectGeometry(f.geometry, f.properties ?? {}, stats)
  } else {
    collectGeometry(obj as Geometry, {}, stats)
  }
}

function parseKmlText(text: string) {
  const dom = new DOMParser().parseFromString(text, 'text/xml')
  if (dom.querySelector('parsererror')) throw new Error('KML inválido.')
  return kml(dom)
}

async function parseKmz(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith('.kml'),
  )
  const entry =
    entries.find((f) => f.name.toLowerCase() === 'doc.kml') ?? entries[0]
  if (!entry) throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ.')
  return parseKmlText(await entry.async('string'))
}

function parseWktText(text: string) {
  const clean = (s: string) => s.replace(/^\s*SRID=\d+;/i, '').trim()

  const whole = parseWkt(clean(text))
  if (whole) return [whole]

  const geoms = text
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean)
    .map((line) => parseWkt(line))
  if (!geoms.length || geoms.some((g) => !g)) throw new Error('WKT inválido.')
  return geoms
}

export async function parseFile(file: File): Promise<ImportResult> {
  const format = detectFormat(file.name)
  if (!format) {
    throw new Error('Formato não suportado. Use GeoJSON, KML, KMZ, WKT ou Shapefile (.zip).')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Arquivo maior que ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }

  let parsed: unknown
  try {
    switch (format) {
      case 'geojson':
        parsed = JSON.parse(await file.text())
        break
      case 'kml':
        parsed = parseKmlText(await file.text())
        break
      case 'kmz':
        parsed = await parseKmz(await file.arrayBuffer())
        break
      case 'wkt':
        parsed = parseWktText(await file.text())
        break
      case 'shp':
        parsed = await shp(await file.arrayBuffer())
        break
    }
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error('JSON inválido.')
    throw err instanceof Error ? err : new Error('Não foi possível ler o arquivo.')
  }

  return toResult(format, parsed)
}

function toResult(format: ImportFormat, parsed: unknown): ImportResult {
  const stats: Stats = { polygons: [], skipped: 0 }
  collect(parsed, stats)

  if (!stats.polygons.length) {
    throw new Error('Nenhum polígono encontrado.')
  }
  return { format, features: stats.polygons, skipped: stats.skipped }
}

/** Texto colado: detecta GeoJSON (começa com { ou [) ou WKT (qualquer outro caso). */
export function parseText(text: string): ImportResult {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Cole um GeoJSON ou WKT.')
  if (trimmed.length > MAX_FILE_BYTES) {
    throw new Error(`Texto maior que ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('JSON inválido.')
    }
    return toResult('geojson', parsed)
  }

  return toResult('wkt', parseWktText(trimmed))
}