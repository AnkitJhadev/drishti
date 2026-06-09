import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useTowersStore } from '../../stores/towersStore'
import Modal from '../Modal'
import { simulateFailure } from './simulate'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SimulationModal({ open, onClose }: Props) {
  const towers = useTowersStore((s) => s.towers)
  const [towerId, setTowerId] = useState<string>('')

  const selected = towers.find((t) => t.id === towerId) ?? towers[0]
  const result = useMemo(() => (selected ? simulateFailure(selected, towers) : null), [selected, towers])

  return (
    <Modal open={open} onClose={onClose} label="Failure simulation" panelClassName="dr-panel w-full max-w-2xl dr-fade-in">
        <div className="dr-panel-header">
          <div className="flex items-center gap-2">
            <span style={{ color: '#3b82f6' }}>⚡</span>
            <h2 className="dr-title">Failure Simulation — what-if impact</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Tower selector */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>SIMULATE FAILURE OF</label>
            <select
              value={selected?.id ?? ''}
              onChange={(e) => setTowerId(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: '#0a0f1e', border: '1px solid #1f2937', color: '#f9fafb' }}
            >
              {towers.map((t) => (
                <option key={t.id} value={t.id}>{t.id} — {t.name} ({t.status})</option>
              ))}
            </select>
          </div>

          {result && selected && (
            <>
              {/* Headline stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="dr-card px-3 py-2">
                  <div className="text-xl font-bold" style={{ color: '#ef4444' }}>{result.directUsers.toLocaleString()}</div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Users directly impacted</div>
                </div>
                <div className="dr-card px-3 py-2">
                  <div className="text-xl font-bold" style={{ color: '#f59e0b' }}>{result.neighbors.length}</div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Towers absorbing load</div>
                </div>
                <div className="dr-card px-3 py-2">
                  <div className="text-xl font-bold" style={{ color: '#f97316' }}>{result.neighbors.filter((n) => n.overloaded).length}</div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>Would overload</div>
                </div>
              </div>

              {/* Projection chart */}
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>PROJECTED IMPACT OVER TIME</div>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.steps} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="impFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="rerFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="step" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" />
                      <Tooltip contentStyle={{ background: '#1a2235', border: '1px solid #1f2937', borderRadius: 6, fontSize: 12, color: '#f9fafb' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="impacted" name="Impacted users" stroke="#ef4444" fill="url(#impFill)" strokeWidth={2} />
                      <Area type="monotone" dataKey="rerouted" name="Rerouted (recovered)" stroke="#10b981" fill="url(#rerFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Neighbor load table */}
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>NEIGHBOURING TOWERS — LOAD REDISTRIBUTION</div>
                <div className="space-y-1">
                  {result.neighbors.length === 0 && (
                    <p className="text-xs" style={{ color: '#ef4444' }}>⚠ No nearby towers in range — total coverage loss in this area.</p>
                  )}
                  {result.neighbors.map((n) => (
                    <div key={n.id} className="flex items-center justify-between px-2 py-1.5 rounded text-xs" style={{ background: '#1a2235' }}>
                      <span style={{ color: '#f9fafb' }}><span className="font-mono">{n.id}</span> · {n.name}</span>
                      <span className="flex items-center gap-2">
                        <span style={{ color: '#9ca3af' }}>+{n.extraLoad.toLocaleString()} users</span>
                        {n.overloaded && <span className="dr-chip" style={{ background: '#7c2d12', color: '#fb923c' }}>OVERLOAD</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs" style={{ color: '#6b7280' }}>
                Model: users redistribute to towers within {selected.coverage_radius_km * 4}km, weighted by proximity. Estimates only.
              </p>
            </>
          )}
        </div>
    </Modal>
  )
}
