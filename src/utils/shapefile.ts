import type { Feature, Position } from 'geojson'
import { strToU8, zipSync } from 'fflate'

/**
 * Gera um Shapefile (ZIP) de polígonos, direto no navegador.
 * Arquivos: .shp (geometrias), .shx (índice), .dbf (atributos),
 *           .prj (WGS 84) e .cpg (UTF-8).
 */

const SHAPE_POLYGON = 5

// WGS 84 (EPSG:4326), no formato WKT do ESRI usado em arquivos .prj
const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

const LABEL: Record<string, string> = { Polygon: 'Polígono', MultiPolygon: 'MultiPolygon' }

/* ---------- Geometria ---------- */

// > 0 = anti-horário, < 0 = horário
const signedArea = (r: Position[]) => {
  let a = 0
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return a / 2
}

// Shapefile: anel externo HORÁRIO e buracos ANTI-HORÁRIOS (o oposto do GeoJSON).
// Leitores como o GDAL/QGIS usam essa orientação para separar externo de buraco.
const orient = (ring: Position[], clockwise: boolean) =>
  signedArea(ring) < 0 === clockwise ? ring : [...ring].reverse()

function featureToRings(g: Feature['geometry']): Position[][] {
  const polygons =
    g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
  if (!polygons) throw new Error(`Shapefile de polígonos não suporta: ${g.type}`)
  return polygons.flatMap((rings) => rings.map((r, i) => orient(r, i === 0)))
}

function bboxOf(points: Position[]): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0]
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const [x, y] of points) {
    if (x < xmin) xmin = x
    if (y < ymin) ymin = y
    if (x > xmax) xmax = x
    if (y > ymax) ymax = y
  }
  return [xmin, ymin, xmax, ymax]
}

/* ---------- .shp e .shx ---------- */

function writeHeader(view: DataView, fileBytes: number, bbox: number[]) {
  view.setInt32(0, 9994, false) // código do arquivo (big-endian)
  view.setInt32(24, fileBytes / 2, false) // tamanho em palavras de 16 bits
  view.setInt32(28, 1000, true) // versão
  view.setInt32(32, SHAPE_POLYGON, true)
  bbox.forEach((v, i) => view.setFloat64(36 + i * 8, v, true))
}

function buildShpShx(records: Position[][][]) {
  const contentBytes = (rings: Position[][]) =>
    44 + 4 * rings.length + 16 * rings.reduce((n, r) => n + r.length, 0)

  const shpBytes = 100 + records.reduce((n, r) => n + 8 + contentBytes(r), 0)
  const shxBytes = 100 + 8 * records.length
  const shp = new DataView(new ArrayBuffer(shpBytes))
  const shx = new DataView(new ArrayBuffer(shxBytes))

  const all = bboxOf(records.flat(2))
  writeHeader(shp, shpBytes, all)
  writeHeader(shx, shxBytes, all)

  let offset = 100
  records.forEach((rings, i) => {
    const length = contentBytes(rings)
    const points = rings.flat()

    shp.setInt32(offset, i + 1, false) // nº do registro (começa em 1)
    shp.setInt32(offset + 4, length / 2, false)
    shx.setInt32(100 + i * 8, offset / 2, false)
    shx.setInt32(100 + i * 8 + 4, length / 2, false)

    let p = offset + 8
    shp.setInt32(p, SHAPE_POLYGON, true)
    p += 4
    bboxOf(points).forEach((v, k) => shp.setFloat64(p + k * 8, v, true))
    p += 32
    shp.setInt32(p, rings.length, true)
    p += 4
    shp.setInt32(p, points.length, true)
    p += 4

    let start = 0
    for (const r of rings) {
      shp.setInt32(p, start, true)
      p += 4
      start += r.length
    }
    for (const [x, y] of points) {
      shp.setFloat64(p, x, true)
      shp.setFloat64(p + 8, y, true)
      p += 16
    }
    offset += 8 + length
  })

  return { shp: new Uint8Array(shp.buffer), shx: new Uint8Array(shx.buffer) }
}

/* ---------- .dbf (dBASE III) ---------- */

const ID_LEN = 10
const NAME_LEN = 80

function buildDbf(names: string[]): Uint8Array {
  const headerLen = 32 + 32 * 2 + 1
  const recordLen = 1 + ID_LEN + NAME_LEN
  const buf = new Uint8Array(headerLen + recordLen * names.length + 1)
  const view = new DataView(buf.buffer)

  const now = new Date()
  buf[0] = 0x03
  buf[1] = now.getFullYear() - 1900
  buf[2] = now.getMonth() + 1
  buf[3] = now.getDate()
  view.setUint32(4, names.length, true)
  view.setUint16(8, headerLen, true)
  view.setUint16(10, recordLen, true)

  const field = (n: number, name: string, type: string, length: number) => {
    const at = 32 + n * 32
    buf.set(strToU8(name), at)
    buf[at + 11] = type.charCodeAt(0)
    buf[at + 16] = length
  }
  field(0, 'ID', 'N', ID_LEN)
  field(1, 'NOME', 'C', NAME_LEN)
  buf[headerLen - 1] = 0x0d // fim dos descritores

  names.forEach((name, i) => {
    let p = headerLen + i * recordLen
    buf[p++] = 0x20 // registro ativo
    buf.set(strToU8(String(i + 1).padStart(ID_LEN, ' ')), p)
    p += ID_LEN
    buf.fill(0x20, p, p + NAME_LEN)
    buf.set(strToU8(name).slice(0, NAME_LEN), p)
  })
  buf[buf.length - 1] = 0x1a // fim do arquivo
  return buf
}

/* ---------- ZIP ---------- */

export type ShapefileResult = {
  zip: Uint8Array
  /** Resumo legível do conteúdo do ZIP, para a pré-visualização */
  summary: string
}

export function toShapefileZip(features: Feature[], base: string): ShapefileResult {
  const records = features.map((f) => featureToRings(f.geometry))
  const names = features.map((f, i) => {
    const label = LABEL[f.geometry.type] ?? 'Geometria'
    return features.length > 1 ? `${label} ${i + 1}` : label
  })

  const { shp, shx } = buildShpShx(records)
  const dbf = buildDbf(names)
  const prj = strToU8(PRJ_WGS84)
  const cpg = strToU8('UTF-8')

  const files = {
    [`${base}.shp`]: shp,
    [`${base}.shx`]: shx,
    [`${base}.dbf`]: dbf,
    [`${base}.prj`]: prj,
    [`${base}.cpg`]: cpg,
  }

  const notes = [
    'geometrias (Polygon)',
    'índice das geometrias',
    'atributos: ID, NOME',
    'sistema de coordenadas: WGS 84 (EPSG:4326)',
    'codificação: UTF-8',
  ]
  const width = Math.max(...Object.keys(files).map((n) => n.length))
  const summary = Object.entries(files)
    .map(([name, data], i) => `${name.padEnd(width)}  ${String(data.length).padStart(5)} bytes  ${notes[i]}`)
    .join('\n')

  return { zip: zipSync(files, { level: 6 }), summary }
}