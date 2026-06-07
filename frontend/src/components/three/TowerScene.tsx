import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Grid } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import { useTowersStore } from '../../stores/towersStore'
import type { Tower, TowerStatus } from '../../types/tower'

const STATUS_COLOR: Record<TowerStatus, string> = {
  operational: '#10b981', degraded: '#f97316', critical: '#ef4444', offline: '#6b7280',
}

const SPAN = 40
// Project India lat/lng → ground-plane x/z
function project(lat: number, lng: number): [number, number] {
  const x = ((lng - 68) / (97 - 68) - 0.5) * SPAN
  const z = -((lat - 8) / (37 - 8) - 0.5) * SPAN
  return [x, z]
}

function TowerPillar({ tower }: { tower: Tower }) {
  const ref = useRef<Mesh>(null)
  const [x, z] = project(tower.coordinates[0], tower.coordinates[1])
  const color = STATUS_COLOR[tower.status]
  const isCritical = tower.status === 'critical'
  const h = 0.6 + Math.min((tower.affected_users || 0) / 5400, 1) * 8

  useFrame((state) => {
    if (isCritical && ref.current) {
      const mat = ref.current.material as MeshStandardMaterial
      mat.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 4) * 0.4
    }
  })

  return (
    <group position={[x, 0, z]}>
      {/* Pillar */}
      <mesh ref={ref} position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.28, 0.28, h, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isCritical ? 0.8 : 0.25} />
      </mesh>
      {/* Coverage dome for affected towers */}
      {tower.status !== 'operational' && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[tower.coverage_radius_km * 1.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} />
        </mesh>
      )}
      {/* Label for non-operational */}
      {tower.status !== 'operational' && (
        <Html position={[0, h + 0.6, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
          <div style={{ fontSize: 10, color, whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
            {tower.id}
          </div>
        </Html>
      )}
    </group>
  )
}

export default function TowerScene() {
  const towers = useTowersStore((s) => s.towers)

  return (
    <Canvas camera={{ position: [0, 26, 32], fov: 50 }} style={{ background: '#0a0f1e' }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[15, 25, 10]} intensity={0.9} />
      <Grid
        infiniteGrid
        cellSize={2}
        cellColor="#1f2937"
        sectionSize={10}
        sectionColor="#374151"
        fadeDistance={70}
        position={[0, 0, 0]}
      />
      {towers.map((t) => <TowerPillar key={t.id} tower={t} />)}
      <OrbitControls enablePan enableZoom enableRotate minDistance={8} maxDistance={70} />
    </Canvas>
  )
}
