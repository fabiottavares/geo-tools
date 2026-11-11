import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useMap } from "react-leaflet"

export default function ColorButton({
  color,
  disabled,
  onChange,
}: {
  color: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const map = useMap()
  const [host, setHost] = useState<HTMLAnchorElement | null>(null)

  useEffect(() => {
    let el: HTMLAnchorElement | null = null

    const mount = () => {
      if (el?.isConnected) return
      const remove = map.getContainer().querySelector('.leaflet-draw-edit-remove')
      if (!remove?.parentElement) return

      el = document.createElement('a')
      el.className = 'leaflet-draw-edit-color'
      el.setAttribute('role', 'button')
      el.style.backgroundImage = 'none'
      el.style.position = 'relative'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      remove.parentElement.insertBefore(el, remove)
      setHost(el)
    }

    mount()

    const root =
      map.getContainer().querySelector('.leaflet-control-container') ?? map.getContainer()
    const observer = new MutationObserver(mount)
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      el?.remove()
      setHost(null)
    }
  }, [map])

  useEffect(() => {
    if (!host) return
    const label = disabled ? 'Selecione um polígono para mudar a cor' : 'Cor da linha'
    host.title = label
    host.setAttribute('aria-label', label)
    host.classList.toggle('leaflet-disabled', disabled)
  }, [host, disabled])

  if (!host) return null

  return createPortal(
    <>
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke={disabled ? 'currentColor' : color}
        strokeWidth="2.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l8 6-3 11H7L4 9z" />
      </svg>
      <input
        type="color"
        value={color}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </>,
    host,
  )
}