# Performance & bundle strategy

Drishti targets **low-bandwidth, low-spec, offline-first** clients (the Chanakya
deployment environment), so the frontend is engineered to keep the initial download
small and push heavy/rarely-used code off the critical path.

## Strategy

1. **Vendor chunk splitting** (`vite.config.ts` → `manualChunks`) — `react-vendor`,
   `leaflet`, `charts` (recharts), and `net` (axios + socket.io) are split into
   separate, independently-cacheable files. On a repeat visit or an app update only
   the changed chunk re-downloads.
2. **Route + feature code-splitting** (`React.lazy` + `Suspense`):
   - `AnalyticsPanel` (recharts) — lazy, rendered behind a skeleton so the map and
     complaint feed paint first.
   - `OntologyModal`, `SimulationModal`, `ThreeDModal` — lazy **and only mounted when
     opened**, so their code is fetched on first open, never on load.
   - `TowerScene` (Three.js) and `OntologyGraph` (D3) — lazy inside their modals.
3. **PWA precache excludes the 3D scene** (`globIgnores: TowerScene-*`) — the 831 KB
   Three.js bundle is never precached offline; it loads on demand only.
4. **OSM map tiles** use a `CacheFirst` runtime strategy (7-day cache) so the map works
   offline and avoids re-fetching tiles on slow links.

## What loads when

| When | Chunks fetched |
|---|---|
| **Initial `/dashboard`** | `index`, `react-vendor`, `Dashboard`, `leaflet`, `net`, css → **~155 KB gzip** |
| Shortly after (analytics panel) | `AnalyticsPanel` + `charts` (recharts) ~116 KB gzip, streamed behind a skeleton — does **not** block first paint |
| On opening **Network Graph** | `OntologyModal` + `OntologyGraph` (D3) ~18 KB gzip |
| On opening **Failure Simulation** | `SimulationModal` ~2 KB gzip (charts already cached) |
| On opening **3D Command View** | `TowerScene` (Three.js) ~226 KB gzip — once, then cached |

## Measured impact of lazy-loading the sidebar modals

| Chunk | Before | After |
|---|---|---|
| `Dashboard` | 43.3 KB | **36.2 KB** |
| `SimulationModal` | (bundled into eager path via Sidebar) | **5.7 KB, on-demand** |
| `OntologyModal` / `ThreeDModal` wrappers | eager | **~1.5 KB each, on-demand** |
| `TowerScene` (Three.js) | on-demand | on-demand (unchanged — already lazy) |
| `OntologyGraph` (D3) | on-demand | on-demand (unchanged — already lazy) |

Net: the always-mounted `Sidebar` no longer drags the simulation/3D/ontology code (and
recharts via the simulation modal) into the initial load.

## Known trade-off

`charts` (recharts) is **424 KB raw / 114 KB gzip** — the largest non-3D dependency.
It's kept off first paint (lazy `AnalyticsPanel`), but the analytics panel is shown by
default so it loads soon after. Future options if the analytics surface grows: tree-shake
to individual recharts imports, or swap to a lighter charting lib (e.g. `visx`/`uplot`).

## How to verify

```bash
cd frontend
npm run build          # vite prints per-chunk raw + gzip sizes
```

For a visual treemap, add `rollup-plugin-visualizer` to `vite.config.ts` and open the
generated `stats.html` after a build.
