import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Feature } from 'geojson'
import { countVertices } from '../utils/exportGeo'
import {
  ACCEPT,
  IMPORT_FORMATS,
  parseFile,
  parseText,
  type ImportResult,
} from '../utils/importGeo'

type Props = {
  open: boolean
  onClose: () => void
  /** Recebe os polígonos já normalizados (MultiPolygon é dividido em partes) */
  onImport: (features: Feature[]) => void
}

type Mode = 'file' | 'text'

type FileState =
  | { status: 'idle' }
  | { status: 'loading'; name: string }
  | { status: 'ready'; name: string; size: number; result: ImportResult }
  | { status: 'error'; name: string; message: string }

type TextState =
  | { status: 'idle' }
  | { status: 'ready'; result: ImportResult }
  | { status: 'error'; message: string }

const MODES: { id: Mode; label: string }[] = [
  { id: 'file', label: 'Arquivo' },
  { id: 'text', label: 'Colar texto' },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function ImportModal({ open, onClose, onImport }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const [mode, setMode] = useState<Mode>('file')
  const [fileState, setFileState] = useState<FileState>({ status: 'idle' })
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)

  // <dialog> nativo: foco preso, Esc e camada superior de graça
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (!open) {
      requestRef.current++ // descarta leituras em andamento
      setMode('file')
      setFileState({ status: 'idle' })
      setText('')
      setDragging(false)
    }
  }, [open])

  // Texto colado é interpretado ao vivo (adiado para não travar com textos grandes)
  const deferredText = useDeferredValue(text)
  const textState = useMemo<TextState>(() => {
    if (!deferredText.trim()) return { status: 'idle' }
    try {
      return { status: 'ready', result: parseText(deferredText) }
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível ler o texto.',
      }
    }
  }, [deferredText])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const id = ++requestRef.current
    setFileState({ status: 'loading', name: file.name })
    try {
      const result = await parseFile(file)
      if (id !== requestRef.current) return
      setFileState({ status: 'ready', name: file.name, size: file.size, result })
    } catch (err) {
      if (id !== requestRef.current) return
      setFileState({
        status: 'error',
        name: file.name,
        message: err instanceof Error ? err.message : 'Não foi possível ler o arquivo.',
      })
    }
    if (inputRef.current) inputRef.current.value = '' // permite reenviar o mesmo arquivo
  }

  // Resultado pronto da aba ativa
  const summary = useMemo(() => {
    if (mode === 'file' && fileState.status === 'ready') {
      return { name: fileState.name, size: fileState.size, result: fileState.result }
    }
    if (mode === 'text' && textState.status === 'ready' && text === deferredText) {
      return {
        name: 'Texto colado',
        size: new Blob([deferredText]).size,
        result: textState.result,
      }
    }
    return null
  }, [mode, fileState, textState, text, deferredText])

  const handleConfirm = () => {
    if (!summary) return
    onImport(summary.result.features)
    onClose()
  }

  const sizeKb = summary
    ? (summary.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : null

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="import-title"
      className="m-auto w-[calc(100%-2rem)] max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/30 open:motion-safe:animate-modal-in"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="import-title" className="text-xl font-semibold">
              Importar
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Os polígonos serão adicionados ao mapa
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

        {/* Origem */}
        <fieldset className="grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <legend className="sr-only">Origem dos dados</legend>
          {MODES.map((m) => (
            <label key={m.id} className="cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
                className="peer sr-only"
              />
              <span className="block rounded-md px-3 py-1.5 text-center text-sm font-medium text-slate-500 transition hover:text-slate-700 peer-checked:bg-white peer-checked:text-blue-600 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-blue-600">
                {m.label}
              </span>
            </label>
          ))}
        </fieldset>

        {/* Entrada */}
        {mode === 'file' ? (
          <div>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                handleFile(e.dataTransfer.files[0])
              }}
              className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition focus-within:outline-2 focus-within:outline-blue-600 ${
                dragging
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="sr-only"
              />
              <svg viewBox="0 0 24 24" className="size-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
              </svg>
              <span className="text-sm font-medium text-slate-700">
                Arraste um arquivo ou <span className="text-blue-600">escolha do computador</span>
              </span>
              <span className="text-xs text-slate-500">
                {Object.values(IMPORT_FORMATS).map((f) => f.label).join(' · ')}
              </span>
            </label>

            <div aria-live="polite" className="mt-2 min-h-5 text-sm">
              {fileState.status === 'loading' && (
                <p className="text-slate-500">Lendo {fileState.name}…</p>
              )}
              {fileState.status === 'error' && (
                <p className="text-red-600">
                  <span className="font-medium">{fileState.name}:</span> {fileState.message}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="import-text" className="sr-only">
              GeoJSON ou WKT
            </label>
            <textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder={'GeoJSON ou WKT, por exemplo:\nPOLYGON((-45.0 -21.2, -44.9 -21.2, -44.9 -21.3, -45.0 -21.2))'}
              className="h-40 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600"
            />
            <div aria-live="polite" className="mt-2 min-h-5 text-sm">
              {textState.status === 'error' && (
                <p className="text-red-600">{textState.message}</p>
              )}
              {textState.status === 'idle' && (
                <p className="text-slate-500">
                  O formato (GeoJSON ou WKT) é detectado automaticamente.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Resumo */}
        {summary && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{summary.name}</span>
              <span className="tabular-nums">{sizeKb} KB</span>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-slate-200 text-sm">
              <div className="bg-white p-3">
                <dt className="text-xs text-slate-500">Formato</dt>
                <dd className="font-medium">{IMPORT_FORMATS[summary.result.format].label}</dd>
              </div>
              <div className="bg-white p-3">
                <dt className="text-xs text-slate-500">Polígonos</dt>
                <dd className="font-medium tabular-nums">
                  {plural(summary.result.features.length, 'polígono', 'polígonos')},{' '}
                  {plural(countVertices(summary.result.features), 'vértice', 'vértices')}
                </dd>
              </div>
            </dl>
            {summary.result.skipped > 0 && (
              <p className="border-t border-slate-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {plural(summary.result.skipped, 'geometria ignorada', 'geometrias ignoradas')} (pontos,
                linhas ou polígonos inválidos).
              </p>
            )}
          </div>
        )}

        {/* Ações */}
        <footer className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!summary}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-600"
          >
            {summary
              ? `Importar ${plural(summary.result.features.length, 'polígono', 'polígonos')}`
              : 'Importar'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}