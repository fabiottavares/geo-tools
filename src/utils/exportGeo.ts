import type { Feature, FeatureCollection, MultiPolygon, Position } from 'geojson'
import { strToU8, zipSync } from 'fflate'
import { toShapefileZip } from './shapefile'

export type ExportFormat = 'geojson' | 'wkt' | 'kml' | 'kmz' | 'shp'

export function toFeatureCollection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features }
}

/* ---------- WKT ---------- */

const pos = (p: Position) => `${p[0]} ${p[1]}`
const ring = (r: Position[]) => `(${r.map(pos).join(', ')})`
const rings = (rs: Position[][]) => `(${rs.map(ring).join(', ')})`

// Converte uma geometria GeoJSON em WKT (coordenadas em x=lng, y=lat)
export function geometryToWkt(g: Feature['geometry']): string {
  switch (g.type) {
    case 'Point':
      return `POINT (${pos(g.coordinates)})`
    case 'LineString':
      return `LINESTRING ${ring(g.coordinates)}`
    case 'Polygon':
      return `POLYGON ${rings(g.coordinates)}`
    case 'MultiPolygon':
      return `MULTIPOLYGON (${g.coordinates.map(rings).join(', ')})`
    default:
      throw new Error(`Geometria não suportada no WKT: ${g.type}`)
  }
}

// Um WKT por linha, um para cada feature
export function toWkt(features: Feature[]): string {
  return features.map((f) => geometryToWkt(f.geometry)).join('\n')
}

/* ---------- KML / KMZ ---------- */

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// KML usa "lng,lat,altitude", separados por espaço
const kmlCoords = (r: Position[]) => r.map((p) => `${p[0]},${p[1]},0`).join(' ')

const kmlPolygon = (rs: Position[][]) => {
  const [outer, ...holes] = rs
  return (
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords(outer)}</coordinates></LinearRing></outerBoundaryIs>` +
    holes
      .map((h) => `<innerBoundaryIs><LinearRing><coordinates>${kmlCoords(h)}</coordinates></LinearRing></innerBoundaryIs>`)
      .join('') +
    `</Polygon>`
  )
}

export function geometryToKml(g: Feature['geometry']): string {
  switch (g.type) {
    case 'Point':
      return `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`
    case 'LineString':
      return `<LineString><coordinates>${kmlCoords(g.coordinates)}</coordinates></LineString>`
    case 'Polygon':
      return kmlPolygon(g.coordinates)
    case 'MultiPolygon':
      return `<MultiGeometry>${g.coordinates.map(kmlPolygon).join('')}</MultiGeometry>`
    default:
      throw new Error(`Geometria não suportada no KML: ${g.type}`)
  }
}

const KML_LABEL: Record<string, string> = {
  Point: 'Ponto',
  LineString: 'Linha',
  Polygon: 'Polígono',
  MultiPolygon: 'MultiPolygon',
}

export function toKml(features: Feature[]): string {
  const placemarks = features
    .map((f, i) => {
      const label = KML_LABEL[f.geometry.type] ?? 'Geometria'
      const name = features.length > 1 ? `${label} ${i + 1}` : label
      return `    <Placemark>
      <name>${escapeXml(name)}</name>
      <styleUrl>#estilo</styleUrl>
      ${geometryToKml(f.geometry)}
    </Placemark>`
    })
    .join('\n')

  // Cores do KML são aabbggrr (aqui: azul #2563eb)
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Polígonos</name>
    <Style id="estilo">
      <LineStyle><color>ffeb6325</color><width>2</width></LineStyle>
      <PolyStyle><color>59eb6325</color></PolyStyle>
    </Style>
${placemarks}
  </Document>
</kml>
`
}

// KMZ = ZIP com o KML na raiz, chamado doc.kml
export function toKmz(features: Feature[]): Uint8Array {
  return zipSync({ 'doc.kml': strToU8(toKml(features)) }, { level: 6 })
}

/* ---------- MultiPolygon ---------- */

// Une todos os polígonos em uma única feição MultiPolygon (cada um vira uma parte)
export function mergeToMultiPolygon(features: Feature[]): Feature<MultiPolygon> {
  const parts: Position[][][] = []
  for (const { geometry: g } of features) {
    if (g.type === 'Polygon') parts.push(g.coordinates)
    else if (g.type === 'MultiPolygon') parts.push(...g.coordinates)
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: parts },
  }
}

// Mais de um polígono desenhado => exporta como um único MultiPolygon
export const isMultiExport = (features: Feature[]) => features.length > 1
// Nome-base dos arquivos exportados
export const baseName = (features: Feature[]) =>
  isMultiExport(features) ? 'multipoligono' : 'poligonos'

/* ---------- Saída ---------- */

export const FORMATS: Record<
  ExportFormat,
  { label: string; ext: string; mime: string; description: string; binary: boolean }
> = {
  geojson: {
    label: 'GeoJSON',
    ext: 'geojson',
    mime: 'application/geo+json',
    description: 'Padrão para web. Abre no QGIS, no geojson.io e no Leaflet.',
    binary: false,
  },
  wkt: {
    label: 'WKT',
    ext: 'wkt',
    mime: 'text/plain',
    description: 'Texto simples, uma geometria por linha. Bom para PostGIS e planilhas.',
    binary: false,
  },
  kml: {
    label: 'KML',
    ext: 'kml',
    mime: 'application/vnd.google-earth.kml+xml',
    description: 'Formato do Google Earth e do Google Maps (Meus Mapas).',
    binary: false,
  },
  kmz: {
    label: 'KMZ',
    ext: 'kmz',
    mime: 'application/vnd.google-earth.kmz',
    description: 'KML compactado em ZIP: arquivo menor, abre no Google Earth.',
    binary: true,
  },
  shp: {
    label: 'Shapefile',
    ext: 'zip',
    mime: 'application/zip',
    description: 'ZIP com .shp, .shx, .dbf, .prj e .cpg. Abre no QGIS, ArcGIS e GeoServer.',
    binary: true,
  },
}

export type ExportFile = {
  /** Texto exibido na pré-visualização (no KMZ, é o doc.kml de dentro do ZIP) */
  text: string
  /** Arquivo que será baixado */
  blob: Blob
}

export function buildFile(format: ExportFormat, features: Feature[]): ExportFile {
  const list = isMultiExport(features) ? [mergeToMultiPolygon(features)] : features
  const { mime } = FORMATS[format]

  switch (format) {
    case 'geojson': {
      const text = JSON.stringify(toFeatureCollection(list), null, 2)
      return { text, blob: new Blob([text], { type: `${mime};charset=utf-8` }) }
    }
    case 'wkt': {
      const text = toWkt(list)
      return { text, blob: new Blob([text], { type: `${mime};charset=utf-8` }) }
    }
    case 'kml': {
      const text = toKml(list)
      return { text, blob: new Blob([text], { type: `${mime};charset=utf-8` }) }
    }
    case 'kmz': {
      const zip = toKmz(list)
      // cópia em ArrayBuffer comum, exigida pelo tipo BlobPart
      const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
      return { text: toKml(list), blob: new Blob([buffer], { type: mime }) }
    }
    case 'shp': {
      const { zip, summary } = toShapefileZip(list, baseName(features))
      const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
      return { text: summary, blob: new Blob([buffer], { type: mime }) }
    }
  }
}

// Conta os vértices (sem repetir o ponto que fecha cada anel)
export function countVertices(features: Feature[]): number {
  const ringCount = (r: Position[]) => Math.max(r.length - 1, 0)
  return features.reduce((total, { geometry: g }) => {
    switch (g.type) {
      case 'Point':
        return total + 1
      case 'LineString':
        return total + g.coordinates.length
      case 'Polygon':
        return total + g.coordinates.reduce((n, r) => n + ringCount(r), 0)
      case 'MultiPolygon':
        return total + g.coordinates.flat().reduce((n, r) => n + ringCount(r), 0)
      default:
        return total
    }
  }, 0)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}