import { useEffect, useState } from 'react'
import { GeoJSON as GeoJSONLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Feature, GeoJsonObject } from 'geojson'
import type { Layer, PathOptions } from 'leaflet'

const DATA_URL = '/municipios_br.json'
const LAYER_MIN_ZOOM = 10

const style: PathOptions = {
  color: '#252525',
  weight: 2,
  opacity: 1,
  fillOpacity: 0,
}

const onEachFeature = (feature: Feature, layer: Layer) => {
  const nome = feature.properties?.NOME ?? feature.properties?.nome
  if (!nome) return
  layer.bindTooltip(String(nome), {
    permanent: true,
    direction: 'center',
    className: 'uf-label',
  })
}

export function CitiesLayer() {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const [data, setData] = useState<GeoJsonObject | null>(null)
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  const visible = zoom >= LAYER_MIN_ZOOM

  useEffect(() => {
    if (!visible || data) return
    const controller = new AbortController()
    fetch(DATA_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<GeoJsonObject>
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Falha ao carregar municípios:', err)
        }
      })
    return () => controller.abort()
  }, [visible, data])

  if (!visible || !data) return null

  return <GeoJSONLayer data={data} style={style} onEachFeature={onEachFeature} />
}