import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import type { EnrichedComplaint } from '../../types/complaint'

// Weight each point by severity so critical clusters glow hotter.
const SEVERITY_WEIGHT: Record<string, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.8,
  critical: 1.0,
}

interface Props {
  complaints: EnrichedComplaint[]
}

// leaflet.heat augments L with heatLayer at runtime; type it loosely.
type HeatLayer = L.Layer & { setLatLngs: (points: number[][]) => void }
type HeatFactory = (points: number[][], opts?: Record<string, unknown>) => HeatLayer

export default function ComplaintHeatmap({ complaints }: Props) {
  const map = useMap()

  useEffect(() => {
    const points = complaints
      .filter((c) => c.coordinates && c.coordinates[0] !== 0 && c.coordinates[1] !== 0)
      .map((c) => [
        c.coordinates[0],
        c.coordinates[1],
        SEVERITY_WEIGHT[c.severity] ?? 0.4,
      ])

    if (points.length === 0) return

    const heatFactory = (L as unknown as { heatLayer: HeatFactory }).heatLayer
    const layer = heatFactory(points, {
      radius: 25,
      blur: 18,
      maxZoom: 12,
      gradient: { 0.2: '#3b82f6', 0.5: '#f59e0b', 0.8: '#f97316', 1.0: '#ef4444' },
    })

    layer.addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [complaints, map])

  return null
}
