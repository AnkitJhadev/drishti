# Drishti — Telecom AI Operations Platform

> _"From complaint to resolution — intelligently."_

## 🔴 Live Demo

| | URL |
|---|---|
| **Frontend** | [https://drishti-agent-ai.vercel.app](https://drishti-agent-ai.vercel.app) |
| **Backend API** | [https://drishti-project-sarvam.duckdns.org/health](https://drishti-project-sarvam.duckdns.org/health) |

**Login credentials:**
> **Email:** `admin@drishti.com` &nbsp;&nbsp; **Password:** `drishti@123`

---

## What this project is

Drishti is an **AI operations dashboard for telecom companies**. Operators receive thousands of
customer complaints a day across scattered channels (email, PDF, SMS, CSV). Drishti reads
them automatically, groups similar ones, links them to the cell tower at fault, and suggests a fix —
all on one real-time command-center screen.

It replaces slow manual triage with an automated pipeline, and lets an operator **monitor** the
network on a live map, **ask questions** in plain English, and **resolve** issues from one place.

---

## Why this project

Drishti was built to demonstrate the exact frontend capabilities Sarvam AI's
**Frontend Engineer, Chanakya** role calls for — production-grade interfaces for strategic-sector
and enterprise AI that hold up in offline-first, low-bandwidth, hardened-client environments.

| Chanakya requirement | Where it lives in Drishti |
|---|---|
| Geospatial overlays | React-Leaflet map — status pins, complaint heatmap, click-to-place towers |
| Simulation UIs | What-if tower-failure impact simulator (haversine redistribution model) |
| Natural-language access layers | RAG chat grounded in real complaint data |
| Ontology viewers | D3 force-directed network graph (towers → clusters → recommendations) |
| Data ingestion dashboards | Drag-drop multi-file upload with live AI pipeline progress tracker |
| Complex enterprise workflows | Real-time approvals, escalation, and resolution flows |
| State management | Zustand stores + offline action queue |
| Data visualisation | D3 · React-Leaflet · Recharts (4-tab analytics) |
| REST + WebSocket integration | Axios + Socket.io (live complaints, alerts, tower status) |
| Performance engineering | Code-splitting + lazy-loaded heavy chunks |
| Offline-first / low-bandwidth | PWA + IndexedDB persistence + queue-and-sync of offline actions |
| WebGL / Three.js (bonus) | 3D network command view (tower pillars, coverage domes, OrbitControls) |

---

## How it works

```
 Complaint comes in        AI reads & tags it       Similar ones grouped
 (CSV / PDF / JSON)    →   (issue + severity)   →   (cluster by area)
                                                            ↓
   Operator resolves    ←   AI suggests a fix    ←   Cluster linked to
   (approve / reject)        (root cause +            nearest tower
                              action)
```

Four AI agents drive the pipeline:

| Agent | Trigger | Does |
|---|---|---|
| **Ingestion** | file uploaded | parse → classify → geocode → embed → store |
| **Pattern** | every N complaints | cluster → link to tower → write recommendation |
| **NL Query** | operator asks a question | RAG (Groq + Qdrant) → grounded answer with map/chart hints |
| **Approval** | operator approves/rejects | update statuses → resolve complaints |

All agents use a **provider-agnostic LLM router** (`Groq → Gemini → Together`) with multi-key rotation — no single paid API is required.

---

## Key engineering decisions

- **Offline-first** — every Zustand store persists to IndexedDB via `idb-keyval`; PWA service worker precaches the app shell
- **On-device AI fallback** — NL assistant runs `all-MiniLM-L6-v2` in the browser via Transformers.js / ONNX Runtime Web for zero-backend offline search
- **Offline action queue** — approvals/resolves made offline are persisted and replayed on reconnect
- **Multi-key Groq rotation** → Gemini fallback with rate-limit cooldown — throttled keys never break a request
- **Web Workers** — CSV/JSON/PDF parsed off the main thread with real-time progress
- **Code splitting** — Three.js, D3, Recharts lazy-loaded off the critical path

---

## Tech stack

**Frontend:** React 18 · TypeScript · Vite · Tailwind · Zustand · React-Leaflet · Recharts · D3 · Three.js · Socket.io-client · PWA (Workbox)

**Backend:** Node.js · Express · TypeScript · BullMQ · PostgreSQL (Neon) · Qdrant Cloud · Redis (Upstash) · local embeddings (`@xenova/transformers`) · Socket.io

**Infrastructure:** AWS EC2 (t2.micro) · Caddy (HTTPS/TLS) · Docker Compose · Vercel (frontend)

---

## Run locally

**Prerequisites:** Node.js 18+, Docker, free [Groq API key](https://console.groq.com)

```bash
# 1. Clone + configure
git clone https://github.com/AnkitJhadev/drishti.git
cd drishti
cp .env.example .env          # set GROQ_API_KEY and JWT_SECRET

# 2. Start infrastructure
docker compose up -d          # Postgres + Qdrant + Redis

# 3. Backend (terminal 1)
cd backend && npm install && npm run dev      # → http://localhost:4000

# 4. Frontend (terminal 2)
cd frontend && npm install && npm run dev     # → http://localhost:3000
```

Log in with `admin@drishti.com` / `drishti@123`, then drop a file from [`sample-data/`](sample-data/) into the Ingest panel.

### Minimum `.env` config

| Variable | Required? | Notes |
|---|---|---|
| `GROQ_API_KEY` | **Yes** | Free from [console.groq.com](https://console.groq.com). Add `GROQ_API_KEY_2…_10` to pool quota. |
| `JWT_SECRET` | **Yes** | Any long random string (`openssl rand -base64 48`) |
| `GEMINI_API_KEY` | Optional | Fallback LLM when Groq quota is spent |

---

## Project structure

```
drishti/
├── backend/src/
│   ├── routes/        REST endpoints (auth, ingest, complaints, towers, ai, …)
│   ├── agents/        4 AI agents (ingestion, pattern, nlQuery, approval)
│   ├── llm/           provider router (Groq → Gemini → Together)
│   ├── rag/           chunker → embedder → indexer → retriever
│   ├── parsers/       CSV + PDF + JSON readers (strict validation)
│   ├── queue/         BullMQ jobs + worker
│   ├── db/            Postgres, Qdrant, migrations, seed
│   └── websocket/     Socket.io server
└── frontend/src/
    ├── pages/         Login, Dashboard
    ├── components/    map · analytics · complaints · ai · approval · ontology · simulation · three
    ├── stores/        Zustand (complaints, towers, alerts, aiChat, auth, action-queue)
    ├── workers/       Web Workers (CSV/JSON/PDF parsing off main thread)
    └── services/      api · socket · offline action-queue · localEmbedder
```

---

## API reference

```
POST   /auth/login
GET    /complaints   GET /complaints/:id   PATCH /complaints/:id/resolve
POST   /ingest                             → upload .csv / .pdf / .json
POST   /ingest/records                     → client-parsed records (Web Worker path)
GET    /towers   GET /towers/:id   POST /towers
GET    /alerts   PATCH /alerts/:id/read
GET    /recommendations   PATCH /recommendations/:id/{approve|reject|resolve}
POST   /ai/chat                            → natural-language RAG query
DELETE /ai/chat/history                    → clear conversation memory
GET    /ontology                           → graph nodes + links for D3
```

All routes except `/auth/login` require `Authorization: Bearer <token>`.

---

## Ingestion format

Accepts `.csv`, `.pdf`, and `.json` only. Invalid rows are rejected per-row with a reason shown in the UI.

**CSV** — must have `complaint` + `location` columns (`phone` optional):
```csv
complaint,location,phone
"No network signal since morning",Bandra Mumbai,9820011001
```

**JSON** — array of `{ complaint, location, phone? }`:
```json
[{ "complaint": "No signal in Bandra", "location": "Bandra Mumbai" }]
```

**PDF** — complaint report with a `Location:` field and complaint text body.

---

## Deployment

Frontend on **Vercel**, backend on **AWS EC2 t2.micro** with Caddy for HTTPS.
Managed services: **Neon** (Postgres) · **Upstash** (Redis) · **Qdrant Cloud**.

Full runbook: [`DEPLOY.md`](DEPLOY.md)
