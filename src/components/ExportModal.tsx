import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature } from 'geojson'
import {
  FORMATS,
  buildFile,
  countVertices,
  baseName,
  downloadBlob,
  isMultiExport,
  type ExportFormat,
} from '../utils/exportGeo'

type Props = {
  open: boolean
  features: Feature[]
  onClose: () => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function ExportModal({ open, features, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [copied, setCopied] = useState(false)

  // <dialog> nativo: foco preso, Esc e camada superior de graça
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const file = useMemo(
    () => (open ? buildFile(format, features) : null),
    [open, format, features],
  )
  const content = file?.text ?? ''

  const { ext, description, binary } = FORMATS[format]
  const isMulti = isMultiExport(features)
  const filename = `${baseName(features)}.${ext}`
  const summary = isMulti
    ? `MultiPolygon com ${plural(features.length, 'parte', 'partes')}`
    : plural(features.length, 'polígono', 'polígonos')
  const sizeKb = ((file?.blob.size ?? 0) / 1024).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="export-title"
      className="m-auto w-[calc(100%-2rem)] max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/30 open:motion-safe:animate-modal-in"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="export-title" className="text-xl font-semibold">
              Exportar
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {summary}, {plural(countVertices(features), 'vértice', 'vértices')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 -mt-1 grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>

        {/* Formato */}
        <div>
          <fieldset className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-5">
            <legend className="sr-only">Formato do arquivo</legend>
            {(Object.keys(FORMATS) as ExportFormat[]).map((f) => (
              <label key={f} className="cursor-pointer">
                <input
                  type="radio"
                  name="export-format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                  className="peer sr-only"
                />
                <span className="block rounded-md px-3 py-1.5 text-center text-sm font-medium text-slate-500 transition hover:text-slate-700 peer-checked:bg-white peer-checked:text-blue-600 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-blue-600">
                  {FORMATS[f].label}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-2 min-h-10 text-sm text-slate-500 sm:min-h-5">{description}</p>
        </div>

        {/* Pré-visualização */}
        <div className="flex h-72 max-h-[40dvh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              {format === 'kmz' ? `doc.kml em ${filename}` : filename}
            </span>
            <span className="tabular-nums">{sizeKb} KB</span>
          </div>
          <pre className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-slate-700">
            <code>{content}</code>
          </pre>
        </div>

        {/* Ações */}
        <footer className="flex justify-end gap-2">
          <button
            onClick={handleCopy}
            disabled={binary}
            title={binary ? 'O arquivo é binário. Use Baixar.' : undefined}
            aria-live="polite"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={() => file && downloadBlob(file.blob, filename)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Baixar
          </button>
        </footer>
      </div>
    </dialog>
  )
}