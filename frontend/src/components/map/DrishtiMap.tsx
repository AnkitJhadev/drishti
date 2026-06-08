import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import TowerMarker from './TowerMarker'
import ComplaintHeatmap from './ComplaintHeatmap'
import { useTowersStore } from '../../stores/towersStore'
import { useComplaintsStore } from '../../stores/complaintsStore'
import api from '../../services/api'
import type { Tower, TowerStatus } from '../../types/tower'

// Center of India
const INDIA_CENTER: [number, number] = [22.5, 79.0]

const LEGEND: Array<{ status: TowerStatus; color: string; label: string }> = [
  { status: 'operational', color: '#10b981', label: 'Operational' },
  { status: 'degraded', color: '#f97316', label: 'Degraded' },
  { status: 'critical', color: '#ef4444', label: 'Critical' },
  { status: 'offline', color: '#6b7280', label: 'Offline' },
]

// Captures a map click while "add tower" mode is active.
function ClickCapture({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function DrishtiMap() {
  const towers = useTowersStore((s) => s.towers)
  const addTower = useTowersStore((s) => s.addTower)
  const complaints = useComplaintsStore((s) => s.complaints)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const mapRef = useRef<LeafletMap | null>(null)

  // ── Add-tower flow ────────────────────────────────────────────────────
  const [addMode, setAddMode] = useState(false)
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null)
  const [name, setName] = useState('')
  const [radius, setRadius] = useState('2')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function cancelAdd() {
    setAddMode(false)
    setPending(null)
    setName('')
    setRadius('2')
    setErr('')
  }

  async function saveTower() {
    if (!pending || !name.trim()) {
      setErr('Enter a tower name')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const { data } = await api.post<{ tower: Tower }>('/towers', {
        name: name.trim(),
        lat: pending.lat,
        lng: pending.lng,
        coverage_radius_km: parseFloat(radius) || 2,
      })
      addTower(data.tower) // socket will also broadcast; store dedupes by id
      cancelAdd()
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add tower')
    } finally {
      setSaving(false)
    }
  }

  // Leaflet must recompute tiles after the container resizes.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 250)
    return () => clearTimeout(t)
  }, [expanded])

  return (
    <div
      className="relative rounded-lg overflow-hidden transition-[height] duration-300"
      style={{ border: '1px solid #1f2937', height: expanded ? '82vh' : 460 }}
    >
      <MapContainer
        ref={mapRef}
        center={INDIA_CENTER}
        zoom={5}
        style={{ height: '100%', width: '100%', background: '#0a0f1e', cursor: addMode ? 'crosshair' : '' }}
        zoomControl={false}
      >
        {/* Dark tile layer (CartoDB dark matter — free, no key) */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
        />

        {showHeatmap && <ComplaintHeatmap complaints={complaints} />}

        {towers.map((tower) => (
          <TowerMarker key={tower.id} tower={tower} />
        ))}

        <ClickCapture active={addMode} onPick={(lat, lng) => setPending({ lat, lng })} />

        {/* Provisional marker for the tower being placed */}
        {pending && (
          <CircleMarker
            center={[pending.lat, pending.lng]}
            radius={8}
            pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.6 }}
          />
        )}
      </MapContainer>

      {/* Header badge */}
      <div
        className="dr-glass absolute top-2 left-2 z-[1000] px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ color: '#f9fafb' }}
      >
        Network Map · {towers.length} towers
      </div>

      {/* Controls */}
      <div className="absolute top-2 right-2 z-[1000] flex gap-2">
        <button
          onClick={() => (addMode ? cancelAdd() : setAddMode(true))}
          className="px-2.5 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            background: addMode ? '#ef4444' : '#10b981',
            color: '#0a0f1e',
            fontWeight: 600,
          }}
        >
          {addMode ? '✕ Cancel' : '＋ Add Tower'}
        </button>
        <button
          onClick={() => setShowHeatmap((v) => !v)}
          className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${showHeatmap ? '' : 'dr-glass'}`}
          style={{
            background: showHeatmap ? '#f59e0b' : undefined,
            color: showHeatmap ? '#0a0f1e' : '#9ca3af',
          }}
        >
          {showHeatmap ? '◉ Heatmap On' : '○ Heatmap Off'}
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="dr-glass px-2.5 py-1.5 rounded-lg text-xs transition-colors"
          style={{ color: '#9ca3af' }}
          title={expanded ? 'Collapse map' : 'Expand map'}
        >
          {expanded ? '⤡ Collapse' : '⤢ Expand'}
        </button>
      </div>

      {/* Add-mode hint banner */}
      {addMode && !pending && (
        <div
          className="dr-glass absolute top-12 left-1/2 z-[1000] px-3 py-1.5 rounded-lg text-xs"
          style={{ transform: 'translateX(-50%)', color: '#f59e0b', border: '1px solid #f59e0b' }}
        >
          📍 Click anywhere on the map to place the new tower
        </div>
      )}

      {/* New-tower form */}
      {pending && (
        <div
          className="absolute top-12 right-2 z-[1100] p-3 rounded-lg w-64"
          style={{ background: '#111827', border: '1px solid #374151' }}
        >
          <div className="text-xs font-semibold mb-2" style={{ color: '#f9fafb' }}>
            New Tower
          </div>
          <div className="text-xs mb-2" style={{ color: '#6b7280' }}>
            📍 {pending.lat.toFixed(4)}, {pending.lng.toFixed(4)}
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tower name (e.g. Lucknow Hazratganj)"
            className="w-full mb-2 px-2 py-1.5 rounded text-xs"
            style={{ background: '#0a0f1e', color: '#f9fafb', border: '1px solid #1f2937' }}
          />
          <label className="text-xs flex items-center gap-2 mb-2" style={{ color: '#9ca3af' }}>
            Coverage (km)
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-16 px-2 py-1 rounded text-xs"
              style={{ background: '#0a0f1e', color: '#f9fafb', border: '1px solid #1f2937' }}
            />
          </label>
          {err && <div className="text-xs mb-2" style={{ color: '#f87171' }}>⚠ {err}</div>}
          <div className="flex gap-2">
            <button
              onClick={saveTower}
              disabled={saving}
              className="flex-1 py-1.5 rounded text-xs font-semibold disabled:opacity-40"
              style={{ background: '#f59e0b', color: '#0a0f1e' }}
            >
              {saving ? 'Adding…' : 'Add Tower'}
            </button>
            <button
              onClick={() => setPending(null)}
              className="px-3 py-1.5 rounded text-xs"
              style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}
            >
              Reposition
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="dr-glass absolute bottom-2 left-2 z-[1000] px-3 py-2 rounded-lg">
        {LEGEND.map((item) => (
          <div key={item.status} className="flex items-center gap-2 text-xs py-0.5" style={{ color: '#9ca3af' }}>
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: item.color }}
            />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}
