import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import type { Tower, TowerStatus } from '../../types/tower'

const STATUS_COLOR: Record<TowerStatus, string> = {
  operational: '#10b981',
  degraded: '#f97316',
  critical: '#ef4444',
  offline: '#6b7280',
}

interface Props {
  tower: Tower
  onSelect?: (towerId: string) => void
}

export default function TowerMarker({ tower, onSelect }: Props) {
  const color = STATUS_COLOR[tower.status]
  const isCritical = tower.status === 'critical'

  return (
    <CircleMarker
      center={[tower.coordinates[0], tower.coordinates[1]]}
      radius={isCritical ? 9 : 7}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: isCritical ? 3 : 2,
      }}
      eventHandlers={{ click: () => onSelect?.(tower.id) }}
      className={isCritical ? 'animate-pulse' : undefined}
    >
      <Tooltip direction="top" offset={[0, -6]}>
        <span style={{ fontWeight: 600 }}>{tower.id}</span> — {tower.status}
      </Tooltip>

      <Popup>
        <div style={{ minWidth: 180, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tower.name}</div>
          <div style={{ fontSize: 12, color: '#374151' }}>
            <div>
              ID: <strong>{tower.id}</strong>
            </div>
            <div>
              Status:{' '}
              <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>
                {tower.status}
              </span>
            </div>
            <div>Active complaints: {tower.active_complaints}</div>
            <div>Affected users: {tower.affected_users.toLocaleString()}</div>
            <div>Coverage: {tower.coverage_radius_km} km</div>
          </div>
        </div>
      </Popup>
    </CircleMarker>
  )
}
