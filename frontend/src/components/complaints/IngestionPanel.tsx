import { useState, useRef, useEffect, type DragEvent, type ChangeEvent } from 'react'
import api from '../../services/api'
import { useComplaintsStore } from '../../stores/complaintsStore'
import Modal from '../Modal'

interface Props {
  open: boolean
  onClose: () => void
}

interface Rejection {
  file: string
  reason: string
}

interface Result {
  message: string
  ids: string[]
  rejected?: Rejection[]
}

const ACCEPTED = '.pdf,.csv,.json'

export default function IngestionPanel({ open, onClose }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [rejected, setRejected] = useState<Rejection[]>([])
  const [step, setStep] = useState<'idle' | 'uploading' | 'ingesting' | 'classifying' | 'clustering' | 'done'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  const complaints = useComplaintsStore((s) => s.complaints)
  const ingestedIds = result?.ids ?? []
  const total = ingestedIds.length
  const classified =
    total === 0
      ? 0
      : (() => {
          const ids = new Set(ingestedIds)
          return complaints.filter((c) => ids.has(c.id) && c.status !== 'pending').length
        })()
  const clustered =
    total === 0
      ? 0
      : (() => {
          const ids = new Set(ingestedIds)
          return complaints.filter((c) => ids.has(c.id) && (c.status === 'recommended' || c.status === 'resolved')).length
        })()

  // Advance step based on live complaint status changes from WebSocket
  useEffect(() => {
    if (step === 'classifying' && classified >= total && total > 0) setStep('clustering')
    if (step === 'clustering' && clustered >= total && total > 0) setStep('done')
  }, [classified, clustered, total, step])

  function addFiles(list: FileList | null) {
    if (!list) return
    // Client-side guard: only .csv / .pdf
    const all = Array.from(list)
    const ok = all.filter((f) => /\.(csv|pdf|json)$/i.test(f.name))
    const bad = all.filter((f) => !/\.(csv|pdf|json)$/i.test(f.name))
    setFiles((prev) => [...prev, ...ok])
    setResult(null)
    setError(bad.length ? `Only .csv, .pdf and .json files are accepted — ignored: ${bad.map((f) => f.name).join(', ')}` : '')
    setRejected([])
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function upload() {
    if (files.length === 0) return
    setUploading(true)
    setStep('uploading')
    setError('')
    setRejected([])
    setResult(null)
    try {
      setStep('ingesting')
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const { data } = await api.post<Result>('/ingest', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      setRejected(data.rejected ?? [])
      setFiles([])
      if ((data.ids ?? []).length > 0) setStep('classifying')
      else setStep('done')
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; message?: string; rejected?: Rejection[] } } })?.response?.data
      setError(resp?.error ?? resp?.message ?? 'Upload failed')
      setRejected(resp?.rejected ?? [])
      setStep('idle')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Ingest complaints"
      panelClassName="w-full max-w-lg rounded-lg"
      panelStyle={{ background: '#111827', border: '1px solid #1f2937' }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1f2937' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>
            Ingest Complaints
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
        </div>

        <div className="p-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg p-8 text-center cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dragOver ? '#f59e0b' : '#374151'}`,
              background: dragOver ? '#1a2235' : '#0a0f1e',
            }}
          >
            <div className="text-2xl mb-2">📥</div>
            <p className="text-sm" style={{ color: '#f9fafb' }}>
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              Structured <strong style={{ color: '#9ca3af' }}>.csv</strong>, <strong style={{ color: '#9ca3af' }}>.pdf</strong> or <strong style={{ color: '#9ca3af' }}>.json</strong> complaint reports only
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded text-xs" style={{ background: '#1a2235' }}>
                  <span className="truncate" style={{ color: '#f9fafb' }}>{f.name}</span>
                  <button onClick={() => removeFile(i)} style={{ color: '#ef4444' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Pipeline step tracker */}
          {step !== 'idle' && (
            <div className="mt-3 rounded text-xs overflow-hidden" style={{ border: '1px solid #1f2937' }}>
              {[
                { key: 'uploading',   label: 'Uploading file',              icon: '📤' },
                { key: 'ingesting',   label: 'Parsing & saving to database', icon: '💾' },
                { key: 'classifying', label: `AI classifying complaints (${classified}/${total})`, icon: '🤖' },
                { key: 'clustering',  label: 'Pattern agent clustering',     icon: '🔍' },
                { key: 'done',        label: `Done — ${total} complaint${total !== 1 ? 's' : ''} processed`, icon: '✅' },
              ].map((s, i, arr) => {
                const stepOrder = ['uploading', 'ingesting', 'classifying', 'clustering', 'done']
                const currentIdx = stepOrder.indexOf(step)
                const thisIdx = stepOrder.indexOf(s.key)
                const isActive = s.key === step
                const isComplete = thisIdx < currentIdx
                return (
                  <div
                    key={s.key}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      background: isActive ? '#0c2a4a' : isComplete ? '#052e16' : '#0a0f1e',
                      borderBottom: i < arr.length - 1 ? '1px solid #1f2937' : undefined,
                      color: isComplete ? '#6ee7b7' : isActive ? '#93c5fd' : '#374151',
                    }}
                  >
                    <span>{isComplete ? '✓' : isActive ? <span className="animate-pulse">{s.icon}</span> : '○'}</span>
                    <span>{s.label}</span>
                    {isActive && s.key !== 'done' && (
                      <span className="ml-auto animate-pulse" style={{ color: '#3b82f6' }}>●</span>
                    )}
                  </div>
                )
              })}
              {/* Progress bar */}
              {step !== 'done' && total > 0 && (
                <div className="h-1" style={{ background: '#1f2937' }}>
                  <div
                    className="h-full transition-[width] duration-700"
                    style={{
                      width: `${Math.round((classified / total) * 100)}%`,
                      background: '#3b82f6',
                    }}
                  />
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="mt-3 px-3 py-2 rounded text-xs" style={{ background: '#7f1d1d', color: '#f87171' }}>
              ⚠ {error}
            </div>
          )}

          {/* Rejected rows / files with reasons */}
          {rejected.length > 0 && (
            <div className="mt-3 px-3 py-2 rounded text-xs space-y-1 max-h-32 overflow-y-auto" style={{ background: '#451a03', color: '#fdba74' }}>
              <div className="font-semibold">{rejected.length} entr{rejected.length === 1 ? 'y' : 'ies'} rejected:</div>
              {rejected.map((r, i) => (
                <div key={i} className="truncate">• <span style={{ color: '#fcd34d' }}>{r.file}</span> — {r.reason}</div>
              ))}
            </div>
          )}

          {/* Required format hint */}
          <div className="mt-3 px-3 py-2 rounded text-xs" style={{ background: '#0a0f1e', color: '#6b7280', border: '1px solid #1f2937' }}>
            <div className="font-semibold" style={{ color: '#9ca3af' }}>Required format</div>
            <div className="mt-1">
              <strong>CSV</strong> header: <code style={{ color: '#fcd34d' }}>complaint,location,phone</code> — <em>location</em> must be a known city/area.
            </div>
            <div className="mt-0.5">
              <strong>PDF</strong>: complaint report with a <code style={{ color: '#fcd34d' }}>Location:</code> field.
            </div>
            <div className="mt-0.5">
              <strong>JSON</strong>: array of <code style={{ color: '#fcd34d' }}>{'{ complaint, location, phone? }'}</code> objects.
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={upload}
              disabled={uploading || files.length === 0}
              className="flex-1 py-2 rounded text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: '#f59e0b', color: '#0a0f1e' }}
            >
              {step === 'uploading' ? 'Uploading…'
                : step === 'ingesting' ? 'Saving…'
                : step === 'classifying' ? `Classifying ${classified}/${total}…`
                : step === 'clustering' ? 'Clustering…'
                : `Ingest ${files.length > 0 ? files.length : ''} file${files.length === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm"
              style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}
            >
              Close
            </button>
          </div>
        </div>
    </Modal>
  )
}
