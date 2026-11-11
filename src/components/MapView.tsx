import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet'
import { EditControl } from 'react-leaflet-draw'
import L from 'leaflet'
import type { Feature } from 'geojson'
import ExportModal from './ExportModal'
import ImportModal from './ImportModal'
import { CitiesLayer } from './CitiesLayer'
import ColorButton from './ColorButton'

type ActionProps = {
  label: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
  children: ReactNode
}

function BarButton({ label, disabled, active, onClick, children }: ActionProps) {
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
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      onClick={handle}
      className={`!flex items-center justify-center ${disabled ? 'leaflet-disabled' : ''} ${active ? '!bg-blue-100 !text-blue-700' : ''
        }`}
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

const svgIcon = (d: string) =>
  `<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`

function AreaToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const map = useMap()
  const elRef = useRef<HTMLAnchorElement | null>(null)
  const onToggleRef = useRef(onToggle)

  useEffect(() => {
    onToggleRef.current = onToggle
  })

  useEffect(() => {
    const el = L.DomUtil.create('a') as HTMLAnchorElement
    el.href = '#'
    el.setAttribute('role', 'button')
    Object.assign(el.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'none',
    })

    const onClick = (e: Event) => {
      L.DomEvent.preventDefault(e)
      L.DomEvent.stopPropagation(e)
      onToggleRef.current()
    }
    L.DomEvent.on(el, 'click', onClick)

    const place = () => {
      const trash = map.getContainer().querySelector('.leaflet-draw-edit-remove')
      if (trash?.parentElement && el.nextSibling !== trash) {
        trash.parentElement.insertBefore(el, trash)
      }
    }
    place()
    elRef.current = el

    const corner =
      map.getContainer().querySelector('.leaflet-top.leaflet-left') ?? map.getContainer()
    const observer = new MutationObserver(place)
    observer.observe(corner, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      L.DomEvent.off(el, 'click', onClick)
      el.remove()
      elRef.current = null
    }
  }, [map])

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const label = visible ? 'Ocultar área' : 'Exibir área'
    el.title = label
    el.setAttribute('aria-label', label)
    el.setAttribute('aria-pressed', String(visible))
    el.style.backgroundColor = visible ? '#dbeafe' : ''
    el.style.color = visible ? '#595a5e' : ''
    el.innerHTML = svgIcon(visible ? RULER : `${RULER} M21 3L3 21`)
  }, [visible, map])

  return null
}

const TRAY = 'M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2'
const RULER =
  'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z' +
  ' M14.5 12.5l2-2 M11.5 9.5l2-2 M8.5 6.5l2-2 M17.5 15.5l2-2'

function MapActions({
  onImport,
  onExport,
  empty,
}: {
  onImport: () => void
  onExport: () => void
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
    </>,
    container,
  )
}

const formatHa = (m2: number) =>
  `${(m2 / 10000).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`

const polygonAreaM2 = (layer: L.Polygon) => {
  const rings = layer.getLatLngs() as L.LatLng[][]
  if (!Array.isArray(rings[0])) return 0
  const outer = L.GeometryUtil.geodesicArea(rings[0])
  const holes = rings.slice(1).reduce((s, r) => s + L.GeometryUtil.geodesicArea(r), 0)
  return outer - holes
}

const updateAreaLabel = (layer: L.Layer) => {
  const poly = layer as L.Polygon
  if (!poly.getLatLngs) return
  poly.unbindTooltip()
  poly.bindTooltip(formatHa(polygonAreaM2(poly)), {
    permanent: true,
    direction: 'center',
    className: 'area-label',
  })
}

function DrawingArea({ enabled }: { enabled: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!enabled) return
    let label: L.Marker | null = null
    const clear = () => {
      label?.remove()
      label = null
    }

    const onVertex = (e: L.LeafletEvent) => {
      const markers = (e as L.LeafletEvent & { layers: L.FeatureGroup }).layers.getLayers()
      const pts = markers.map((m) => (m as L.Marker).getLatLng())
      if (pts.length < 3) return clear()

      const center = L.polygon(pts).getBounds().getCenter()
      const icon = L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<span class="area-label" style="position:absolute;transform:translate(-50%,-50%)">${formatHa(
          L.GeometryUtil.geodesicArea(pts),
        )}</span>`,
      })

      if (!label) {
        label = L.marker(center, { icon, interactive: false, keyboard: false }).addTo(map)
      } else {
        label.setLatLng(center).setIcon(icon)
      }
    }

    map.on('draw:drawvertex', onVertex)
    map.on('draw:drawstop', clear)
    return () => {
      map.off('draw:drawvertex', onVertex)
      map.off('draw:drawstop', clear)
      clear()
    }
  }, [map, enabled])

  return null
}

export default function MapView() {
  const mapRef = useRef<L.Map>(null)
  const groupRef = useRef<L.FeatureGroup>(null)
  const [polygons, setPolygons] = useState<Feature[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const selectedRef = useRef<L.Path | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [color, setColor] = useState('#3388ff')

  const colorRef = useRef('#3388ff')
  const exportModeRef = useRef(false)
  const exportSelRef = useRef<Map<L.Path, { weight?: number; fillOpacity?: number }>>(new Map())
  const [exportMode, setExportMode] = useState(false)
  const [exportCount, setExportCount] = useState(0)
  const [toExport, setToExport] = useState<Feature[]>([])
  const [showArea, setShowArea] = useState(true)
  const showAreaRef = useRef(true)

  const toggleArea = () => {
    const next = !showAreaRef.current
    showAreaRef.current = next
    setShowArea(next)
    groupRef.current?.eachLayer((l) =>
      next ? updateAreaLabel(l) : l.unbindTooltip(),
    )
  }

  const applyAreaLabel = (l: L.Layer) => {
    if (showAreaRef.current) updateAreaLabel(l)
  }

  const markForExport = (layer: L.Path) => {
    exportSelRef.current.set(layer, {
      weight: layer.options.weight,
      fillOpacity: layer.options.fillOpacity,
    })
    layer.setStyle({ weight: 6, fillOpacity: 0.5 })
  }

  const unmarkForExport = (layer: L.Path) => {
    const original = exportSelRef.current.get(layer)
    if (original) layer.setStyle(original)
    exportSelRef.current.delete(layer)
  }

  const clearExportSelection = () => {
    exportSelRef.current.forEach((original, layer) => layer.setStyle(original))
    exportSelRef.current.clear()
    setExportCount(0)
  }

  const startExport = () => {
    clearExportSelection()
    exportModeRef.current = true
    setExportMode(true)
  }

  const cancelExport = () => {
    clearExportSelection()
    exportModeRef.current = false
    setExportMode(false)
  }

  const toggleExport = (layer: L.Path) => {
    if (exportSelRef.current.has(layer)) unmarkForExport(layer)
    else markForExport(layer)
    setExportCount(exportSelRef.current.size)
  }

  const toggleAllExport = () => {
    const layers = (groupRef.current?.getLayers() ?? []) as L.Path[]
    const allMarked = layers.every((l) => exportSelRef.current.has(l))
    layers.forEach((l) => (allMarked ? unmarkForExport(l) : exportSelRef.current.has(l) || markForExport(l)))
    setExportCount(exportSelRef.current.size)
  }

  const confirmExport = () => {
    const features = Array.from(exportSelRef.current.keys()).map(
      (l) => (l as L.Polygon).toGeoJSON() as Feature,
    )
    cancelExport()
    setToExport(features)
    setExportOpen(true)
  }

  const handleGroupClick = (e: L.LeafletEvent) => {
    if (!exportModeRef.current) return selectLayer(e)
    const layer = (e as L.LeafletEvent & { layer: L.Path }).layer
    if (layer?.setStyle) toggleExport(layer)
  }

  const selectLayer = (e: L.LeafletEvent) => {
    const layer = (e as L.LeafletEvent & { layer: L.Path }).layer
    if (!layer?.setStyle) return
    const c = (layer.options.color as string) ?? '#3388ff'
    selectedRef.current = layer
    colorRef.current = c
    setHasSelection(true)
    setColor(c)
  }

  const changeColor = (value: string) => {
    colorRef.current = value
    setColor(value)
    const layer = selectedRef.current as (L.Path & { feature?: Feature }) | null
    if (!layer) return

    layer.setStyle({ color: value })
    layer.feature = {
      type: 'Feature',
      properties: { ...(layer.feature?.properties ?? {}), color: value },
      geometry: undefined as never,
    }
    sync()
  }

  const handleCreated = (e: L.LeafletEvent) => {
    const layer = (e as L.LeafletEvent & { layer: L.Path & { feature?: Feature } }).layer
    layer.setStyle?.({ color: colorRef.current })
    layer.feature = {
      type: 'Feature',
      properties: { color: colorRef.current },
      geometry: undefined as never,
    }
    applyAreaLabel(layer)
    sync()
  }

  const sync = () => {
    const layers = groupRef.current?.getLayers() ?? []
    setPolygons(layers.map((l) => (l as L.Polygon).toGeoJSON() as Feature))
  }

  const addPolygons = (features: Feature[]) => {
    const group = groupRef.current
    const map = mapRef.current
    if (!group || features.length === 0) return

    features.forEach((feature) => {
      L.geoJSON(feature, {
        style: (f) => ({ color: (f?.properties?.color as string) ?? '#3388ff' }),
      }).eachLayer((layer) => group.addLayer(layer))
    })
    group.eachLayer(applyAreaLabel)
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
        center={[-14.2350, -51.9253]}
        zoom={5}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CitiesLayer />
        <MapActions
          onImport={() => setImportOpen(true)}
          onExport={startExport}
          empty={polygons.length === 0}
        />
        <FeatureGroup ref={groupRef} eventHandlers={{ click: handleGroupClick }}>
          <EditControl
            position="topleft"
            onCreated={handleCreated}
            onEdited={() => {
              groupRef.current?.eachLayer(applyAreaLabel)
              sync()
            }}
            onDeleted={() => {
              selectedRef.current = null
              setHasSelection(false)
              sync()
            }}
            draw={{
              polygon: { allowIntersection: false, showArea: false },
              rectangle: false, polyline: false, circle: false,
              circlemarker: false, marker: false,
            }}
          />
        </FeatureGroup>
        <ColorButton color={color} disabled={!hasSelection} onChange={changeColor} />
        <AreaToggle visible={showArea} onToggle={toggleArea} />
        <DrawingArea enabled={showArea} />
      </MapContainer>

      {exportMode && (
        <div className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-md bg-white px-3 py-2 shadow-md">
          <span className="text-sm text-gray-700">
            {exportCount === 0
              ? 'Clique nos polígonos para selecionar'
              : `${exportCount} selecionado${exportCount > 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            onClick={toggleAllExport}
            className="text-sm text-blue-600 hover:underline"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={cancelExport}
            className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmExport}
            disabled={exportCount === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Exportar
          </button>
        </div>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={addPolygons}
      />

      <ExportModal
        open={exportOpen}
        features={toExport}
        onClose={() => setExportOpen(false)}
      />
    </div>
  )
}