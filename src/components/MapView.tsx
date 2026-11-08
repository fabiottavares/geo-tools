import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import L from 'leaflet'
import type { Feature } from 'geojson'
import ExportModal from './ExportModal'
import ImportModal from './ImportModal'
import { CitiesLayer } from './CitiesLayer'

type ActionProps = {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

// Botão no mesmo padrão do zoom (.leaflet-bar a)
function BarButton({ label, disabled, onClick, children }: ActionProps) {
  const handle = (e: MouseEvent) => {
    e.preventDefault()
    if (!disabled) onClick()
  }
  return (
    <a
      href="#"
      role="button"
      title={label}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={handle}
      className={`!flex items-center justify-center ${disabled ? 'leaflet-disabled' : ''}`}
    >
      {children}
    </a>
  )
}

const icon = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const TRAY = 'M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2'
const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M9 7V4h6v3'

// Controle do Leaflet adicionado no canto superior esquerdo, logo abaixo do zoom
function MapActions({
  onImport,
  onExport,
  onClear,
  empty,
}: {
  onImport: () => void
  onExport: () => void
  onClear: () => void
  empty: boolean
}) {
  const map = useMap()
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const control = new L.Control({ position: 'topleft' })
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      L.DomEvent.disableClickPropagation(div)
      L.DomEvent.disableScrollPropagation(div)
      setContainer(div)
      return div
    }
    control.addTo(map)
    return () => {
      control.remove()
      setContainer(null)
    }
  }, [map])

  if (!container) return null

  return createPortal(
    <>
      <BarButton label="Importar" onClick={onImport}>
        {icon(`M12 15V3m0 0L8 7m4-4l4 4M${TRAY.slice(1)}`)}
      </BarButton>
      <BarButton label="Exportar" disabled={empty} onClick={onExport}>
        {icon(`M12 3v12m0 0l-4-4m4 4l4-4M${TRAY.slice(1)}`)}
      </BarButton>
      <BarButton label="Limpar mapa" disabled={empty} onClick={onClear}>
        {icon(TRASH)}
      </BarButton>
    </>,
    container,
  )
}

export default function MapView() {
  const mapRef = useRef<L.Map>(null)
  const groupRef = useRef<L.FeatureGroup>(null)
  const [polygons, setPolygons] = useState<Feature[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const sync = () => {
    const layers = groupRef.current?.getLayers() ?? []
    setPolygons(layers.map((l) => (l as L.Polygon).toGeoJSON() as Feature))
  }

  const clearMap = () => {
    if (!window.confirm('Remover todos os polígonos do mapa?')) return
    groupRef.current?.clearLayers()
    sync()
  }

  const addPolygons = (features: Feature[]) => {
    const group = groupRef.current
    const map = mapRef.current
    if (!group || features.length === 0) return

    // Cada feature vira uma layer dentro do FeatureGroup editável,
    // então os importados também podem ser editados/removidos no mapa.
    features.forEach((feature) => {
      L.geoJSON(feature).eachLayer((layer) => group.addLayer(layer))
    })

    sync()

    const bounds = group.getBounds()
    if (map && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
    }
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={mapRef}
        center={[-21.25, -45.0]}
        zoom={13}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CitiesLayer />
        <MapActions
          onImport={() => setImportOpen(true)}
          onExport={() => setExportOpen(true)}
          onClear={clearMap}
          empty={polygons.length === 0}
        />
        <FeatureGroup ref={groupRef}>
          <EditControl
            position="topright"
            onCreated={sync}
            onEdited={sync}
            onDeleted={sync}
            draw={{
              polygon: { allowIntersection: false, showArea: false },
              rectangle: false, polyline: false, circle: false,
              circlemarker: false, marker: false,
            }}
          />
        </FeatureGroup>
      </MapContainer>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={addPolygons}
      />

      <ExportModal
        open={exportOpen}
        features={polygons}
        onClose={() => setExportOpen(false)}
      />
    </div>
  )
}