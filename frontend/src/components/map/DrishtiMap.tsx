import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import TowerMarker from './TowerMarker'
import ComplaintHeatmap from './ComplaintHeatmap'
import { useTowersStore } from '../../stores/towersStore'
import { useComplaintsStore } from '../../stores/complaintsStore'
import type { TowerStatus } from '../../types/tower'

// Center of India
const INDIA_CENTER: [number, number] = [22.5, 79.0]

const LEGEND: Array<{ status: TowerStatus; color: string; label: string }> = [
  { status: 'operational', color: '#10b981', label: 'Operational' },
  { status: 'degraded', color: '#f97316', label: 'Degraded' },
  { status: 'critical', color: '#ef4444', label: 'Critical' },
  { status: 'offline', color: '#6b7280', label: 'Offline' },
]

export default function DrishtiMap() {
  const towers = useTowersStore((s) => s.towers)
  const complaints = useComplaintsStore((s) => s.complaints)
  const [showHeatmap, setShowHeatmap] = useState(true)

  return (
    <div className="h-full relative rounded overflow-hidden" style={{ border: '1px solid #1f2937' }}>
      <MapContainer
        center={INDIA_CENTER}
        zoom={5}
        style={{ height: '100%', width: '100%', background: '#0a0f1e' }}
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
      </MapContainer>

      {/* Header badge */}
      <div
        className="absolute top-2 left-2 z-[1000] px-3 py-1.5 rounded text-xs font-semibold"
        style={{ background: 'rgba(17,24,39,0.9)', color: '#f9fafb', border: '1px solid #1f2937' }}
      >
        Network Map · {towers.length} towers
      </div>

      {/* Heatmap toggle */}
      <button
        onClick={() => setShowHeatmap((v) => !v)}
        className="absolute top-2 right-2 z-[1000] px-2.5 py-1.5 rounded text-xs transition-colors"
        style={{
          background: showHeatmap ? '#f59e0b' : 'rgba(17,24,39,0.9)',
          color: showHeatmap ? '#0a0f1e' : '#9ca3af',
          border: '1px solid #1f2937',
        }}
      >
        {showHeatmap ? '◉ Heatmap On' : '○ Heatmap Off'}
      </button>

      {/* Legend */}
      <div
        className="absolute bottom-2 left-2 z-[1000] px-3 py-2 rounded"
        style={{ background: 'rgba(17,24,39,0.9)', border: '1px solid #1f2937' }}
      >
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
