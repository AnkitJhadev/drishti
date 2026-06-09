# Drishti — Telecom AI Operations Platform

[![CI](https://github.com/AnkitJhadev/drishti/actions/workflows/ci.yml/badge.svg)](https://github.com/AnkitJhadev/drishti/actions/workflows/ci.yml)

> _"From complaint to resolution — intelligently."_

---

## 1. Start the project locally

**Prerequisites:** Node.js 18+, Docker, and a free [Groq API key](https://console.groq.com).

```bash
# 1. Clone + configure
git clone https://github.com/AnkitJhadev/drishti.git
cd drishti
cp .env.example .env          # then set GROQ_API_KEY and JWT_SECRET

# 2. Start infrastructure (Postgres + Qdrant + Redis)
docker compose up -d

# 3. Backend  (terminal 1)
cd backend && npm install && npm run dev      # → http://localhost:4000

# 4. Frontend (terminal 2)
cd frontend && npm install && npm run dev     # → http://localhost:3000
```

Open **http://localhost:3000** and log in with the pre-filled demo account:

> **Email:** `admin@drishti.com`  **Password:** `drishti@123`

**Try it:** click **＋ Ingest Complaints** and drop in a file from [`sample-data/`](sample-data/)
(e.g. `complaints.csv`). Watch complaints classify, cluster on the map, and a tower turn critical — live.

---

## 2. What this project is

Drishti is an **AI operations dashboard for telecom companies**. Operators receive thousands of
customer complaints a day across scattered channels (email, PDF, image, SMS, CSV). Drishti reads
them automatically, groups similar ones, links them to the cell tower at fault, and suggests a fix —
all on one real-time "command center" screen.

It replaces slow manual triage with an automated pipeline, and lets an operator **monitor** the
network on a live map, **ask questions** in plain English, and **resolve** issues from one place.

---

## 3. How it works

```
 Complaint comes in        AI reads & tags it       Similar ones grouped
 (CSV / PDF / email)   →   (issue + severity)   →   (cluster by area)
                                                            ↓
   Operator resolves    ←   AI suggests a fix    ←   Cluster linked to
   (approve / reject)        (root cause +            nearest tower
                              action)
```

Four AI agents drive the pipeline, each with one job:

| Agent | Trigger | Does |
|---|---|---|
| **Ingestion** | a file is uploaded | parse → classify (issue + severity) → geocode → embed → store |
| **Pattern** | every N complaints | cluster similar complaints → link to nearest tower → write a recommendation |
| **NL Query** | operator asks a question | retrieve relevant complaints (RAG) → answer, grounded in real data |
| **Approval** | operator approves/rejects | update statuses → open a resolution ticket |

All agents talk to LLMs through one **provider-agnostic router** (`backend/src/llm/`) that tries
**Groq → Gemini → Together**, so no single paid API is required. Everything updates live over
**Socket.io**, and the dashboard is **offline-first** (PWA + IndexedDB) so it keeps working on
low-bandwidth / disconnected clients.

---

## Why this project

Drishti was built to demonstrate the exact frontend capabilities Sarvam AI's
**Frontend Engineer, Chanakya** role calls for — production-grade interfaces for strategic-sector
and enterprise AI that hold up in offline-first, low-bandwidth, hardened-client environments. Each
requirement maps to something real and working here:

| Chanakya requirement | Where it lives in Drishti |
|---|---|
| Geospatial overlays | React-Leaflet map — status pins, complaint heatmap, click-to-place towers |
| Simulation UIs | what-if tower-failure impact simulator |
| Natural-language access layers | RAG chat grounded in real complaint data |
| Ontology viewers | D3 force-directed network graph |
| Data ingestion dashboards | drag-drop multi-file upload with strict validation + live agent progress |
| Complex enterprise workflows | real-time approvals, escalation, and resolution flows |
| State management | Zustand stores + an offline action queue |
| Data visualisation | D3 · React-Leaflet · Recharts |
| REST + WebSocket integration | Axios + Socket.io (live complaints, alerts, tower status) |
| Performance engineering | code-splitting + lazy-loaded heavy chunks ([`docs/performance.md`](docs/performance.md)) |
| Offline-first / low-bandwidth | PWA + IndexedDB persistence + queue-and-sync of actions made offline |
| WebGL / Three.js (bonus) | 3D network command view |

---

## Offline & resilience

Drishti is built to keep working when the network drops — the Chanakya brief calls for
offline-first, low-bandwidth, hardened clients. How it handles a connection loss:

- **App shell is a PWA** (`vite-plugin-pwa` + Workbox) — the UI loads with no network at all.
- **All live data is cached in IndexedDB.** Every Zustand store (complaints, towers, alerts,
  **AI chat + recommendations**, auth) persists locally, so the dashboard renders cached state
  instantly on reload or offline — including previously received AI answers.
- **Map tiles cache** with a `CacheFirst` strategy (7-day), so the map still renders offline.
- **Actions taken offline are queued, not lost.** Approve / reject / resolve while disconnected
  are written to an IndexedDB **action queue** and **replayed automatically on reconnect**
  (`window.online` + socket reconnect). A banner shows the pending count and "syncing…" state.
- **Live updates degrade gracefully** — the Socket.io connection drives a `LIVE / CONNECTING /
  OFFLINE` indicator; on reconnect it re-syncs and flushes the queue.

```
offline → optimistic UI update → action queued in IndexedDB
        ↘ banner: "2 actions queued — will sync on reconnect"
reconnect → flushQueue() replays each action → banner clears
```

See `src/services/actionQueue.ts`, `src/stores/*` (persist + `idbStorage`), and `vite.config.ts`.

---

## Tech stack

**Frontend:** React 18 + TypeScript + Vite · Tailwind · Zustand · React-Leaflet · Recharts · D3 · Three.js · Socket.io-client · PWA
**Backend:** Node + Express + TypeScript · BullMQ · PostgreSQL · Qdrant (vectors) · local embeddings (`@xenova/transformers`) · Socket.io

---

## Project structure

```
drishti/
├── backend/src/
│   ├── routes/        REST endpoints (auth, ingest, complaints, towers, ai, …)
│   ├── agents/        the 4 AI agents (ingestion, pattern, nlQuery, approval)
│   ├── llm/           provider router (Groq → Gemini → Together)
│   ├── rag/           chunker → embedder → indexer → retriever
│   ├── parsers/       CSV + PDF readers (with strict validation)
│   ├── queue/         BullMQ jobs + worker
│   ├── db/            Postgres, Qdrant, migrations, seed
│   └── websocket/     Socket.io server
└── frontend/src/
    ├── pages/         Login, Dashboard
    ├── components/    map · analytics · complaints · ai · approval · ontology · simulation · three
    ├── stores/        Zustand (complaints, towers, alerts, aiChat, auth, action-queue)
    └── services/      api (axios) · socket · offline action-queue
```

More detail: [`docs/performance.md`](docs/performance.md) (bundle strategy) · [`sample-data/README.md`](sample-data/README.md) (data format).

---

## API reference

```
POST   /auth/login                    → { token, operator }
GET    /complaints  ·  GET /complaints/:id
POST   /ingest                        → upload .csv / .pdf complaint reports
GET    /towers  ·  GET /towers/:id  ·  POST /towers   (add a tower)
GET    /alerts  ·  PATCH /alerts/:id/read
GET    /recommendations  ·  PATCH /recommendations/:id/{approve|reject|escalate|resolve}
POST   /ai/chat                       → natural-language query (RAG)
```

All routes except `/auth/login` need `Authorization: Bearer <token>`.

---

## Ingestion format (strict)

Only **`.csv`** and **`.pdf`** are accepted, and the content must be structured:

- **CSV** — header `complaint,location,phone`; `location` must be a known city/area.
- **PDF** — a complaint report with a `Location:` field.

Invalid files/rows are rejected with a clear reason. See [`sample-data/README.md`](sample-data/README.md).

---

## Develop & verify

```bash
cd backend  && npx tsc --noEmit && npm test     # types + unit tests
cd frontend && npm run typecheck && npm run build
```

- TypeScript everywhere (no `any`); all API calls go through `services/api.ts`.
- CI (GitHub Actions) runs typecheck + test + build on every push.
- Commits are plain human-style (no AI co-author line).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AggregateError` on backend start | Run `docker compose up -d` first — Postgres/Qdrant/Redis must be up. |
| Agents don't classify | Set `GROQ_API_KEY` (free). Free tier ~100K tokens/day — add `GEMINI_API_KEY` as fallback. |
| First RAG query is slow | Local embedding model (~30 MB) downloads once, then cached. |
| 401 on every request | JWT expired (8h) — log in again. |

---

## Deployment

Free-tier targets ([`render.yaml`](render.yaml)): Vercel (frontend) · Render (API) · Supabase (Postgres) · Upstash (Redis) · Qdrant Cloud (vectors). Swap the local `.env` values for the production ones and set `NODE_ENV=production`.
