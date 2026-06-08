import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import api from '../../services/api'

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

const ACCEPTED = '.pdf,.csv'

export default function IngestionPanel({ open, onClose }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [rejected, setRejected] = useState<Rejection[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  function addFiles(list: FileList | null) {
    if (!list) return
    // Client-side guard: only .csv / .pdf
    const all = Array.from(list)
    const ok = all.filter((f) => /\.(csv|pdf)$/i.test(f.name))
    const bad = all.filter((f) => !/\.(csv|pdf)$/i.test(f.name))
    setFiles((prev) => [...prev, ...ok])
    setResult(null)
    setError(bad.length ? `Only .csv and .pdf files are accepted — ignored: ${bad.map((f) => f.name).join(', ')}` : '')
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
    setError('')
    setRejected([])
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const { data } = await api.post<Result>('/ingest', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      setRejected(data.rejected ?? [])
      setFiles([])
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; message?: string; rejected?: Rejection[] } } })?.response?.data
      // A 400 with rejections (nothing valid ingested) — show why.
      setError(resp?.error ?? resp?.message ?? 'Upload failed')
      setRejected(resp?.rejected ?? [])
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1700] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-lg" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1f2937' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>
            Ingest Complaints
          </h2>
          <button onClick={onClose} className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
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
              Structured <strong style={{ color: '#9ca3af' }}>.csv</strong> or <strong style={{ color: '#9ca3af' }}>.pdf</strong> complaint reports only
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

          {/* Result / error */}
          {result && (
            <div className="mt-3 px-3 py-2 rounded text-xs" style={{ background: '#064e3b', color: '#6ee7b7' }}>
              ✓ {result.message} — agents are now processing them live.
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
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={upload}
              disabled={uploading || files.length === 0}
              className="flex-1 py-2 rounded text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: '#f59e0b', color: '#0a0f1e' }}
            >
              {uploading ? 'Uploading…' : `Ingest ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
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
      </div>
    </div>
  )
}
