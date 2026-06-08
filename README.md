# Drishti — Telecom AI Operations Platform

[![CI](https://github.com/AnkitJhadev/drishti/actions/workflows/ci.yml/badge.svg)](https://github.com/AnkitJhadev/drishti/actions/workflows/ci.yml)

> _"From complaint to resolution — intelligently."_

Drishti is a full-stack AI platform for telecom operators. Customer complaints arrive
from many channels (email, PDF, image, SMS, CSV); AI agents automatically classify them,
cluster patterns, correlate them to cell towers, and generate fix recommendations — all
surfaced in a real-time, offline-first operations dashboard styled like a command center.

<p align="center"><em>React 18 · TypeScript · Express · PostgreSQL · Qdrant · BullMQ · Socket.io</em></p>

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [How the pipeline works](#how-the-pipeline-works)
- [API reference](#api-reference)
- [Real-time events](#real-time-events)
- [Development & conventions](#development--conventions)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)

---

## What it does

```
                  ┌─────────────────────────────────────────────────┐
  Email / PDF     │  1. INGEST    parse → classify → embed → store  │
  Image / CSV ───▶│  2. PATTERN   cluster → correlate to tower      │
  SMS             │  3. RECOMMEND root cause + suggested action     │
                  │  4. APPROVE   human-in-the-loop resolve         │
                  └───────────────────────┬─────────────────────────┘
                                          ▼
                        Real-time ops dashboard (map, charts,
                        NL chat, ontology graph, 3D, simulation)
```

Operators get a single dashboard to **monitor** (live feed + geospatial map + analytics),
**query** (natural-language RAG chat grounded in real complaint data), and **resolve**
(approve/reject AI recommendations, track resolution tickets).

**Headline features**

- **Multi-channel ingestion** — PDF (`unpdf`/`pdf-parse`), CSV (`papaparse`), image (Tesseract OCR + Gemini vision fallback), email (`mailparser` + IMAP polling). Drag-and-drop UI.
- **4 AI agents** via a provider-agnostic runner — Ingestion (classify), Pattern (cluster + correlate + recommend), NL Query (RAG chat), Approval (resolution follow-up).
- **Custom RAG pipeline** — chunker → embedder → indexer → retriever, backed by Qdrant vectors. No LangChain.
- **Live dashboard** — React-Leaflet map (markers + heatmap), Recharts analytics, NL chat bar, approvals drawer.
- **Advanced views** — D3 ontology/network graph, what-if tower-failure simulation, Three.js 3D command view.
- **Offline-first** — PWA + Workbox + IndexedDB; JWT persists so the app stays usable without a connection.
- **Real-time** — Socket.io pushes new complaints, alerts, recommendations, and tower status changes.

---

## Architecture

```
┌──────────────────────────── Frontend (Vite/React) ────────────────────────────┐
│  pages/  · components/{map,analytics,ai,approval,ontology,simulation,three}    │
│  stores/ (Zustand) · services/{api,socket,idbStorage} · hooks/                 │
└───────────────┬───────────────────────────────────────────┬───────────────────┘
                │ REST (Axios + JWT)                          │ WebSocket (Socket.io)
                ▼                                             ▼
┌──────────────────────────── Backend (Express/TS) ─────────────────────────────┐
│  routes/ ──▶ queue/ (BullMQ) ──▶ agents/ ──▶ llm/ (router: Groq→Gemini→Together)│
│                                      │                                          │
│                                      ├──▶ rag/ (chunker→embedder→indexer→retr.) │
│                                      └──▶ parsers/ (pdf, csv, image, email)     │
│  websocket/ (Socket.io)   middleware/ (auth, errors)   db/ (pg + qdrant)        │
└───────────────┬──────────────────┬──────────────────┬─────────────────────────┘
                ▼                  ▼                  ▼
          PostgreSQL            Qdrant              Redis
        (relational)          (vectors)         (BullMQ jobs)
```

> **Note:** This README documents what is **actually built**. The repo's `CLAUDE.md` also
> tracks the _original plan_ and the deliberate divergences from it — see
> [Key divergences from the original plan](#key-divergences-from-the-original-plan).

---

## Tech stack

### Backend
| Concern | Choice |
|---|---|
| Runtime | Node.js + Express + TypeScript |
| Job queue | BullMQ + Redis |
| Primary DB | PostgreSQL |
| Vector DB | Qdrant |
| Embeddings | **Local** `@xenova/transformers` `all-MiniLM-L6-v2` (384-dim) — Voyage AI optional |
| LLM | **Groq (Llama 3.3 70B) → Gemini → Together** fallback chain |
| Parsing | `unpdf`/`pdf-parse`, `papaparse`, `tesseract.js`, `mailparser` |
| Auth | JWT + bcrypt (8h expiry) |
| Real-time | Socket.io |
| Logging | Winston |

### Frontend
| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (dark "ops" theme) |
| State | Zustand (`complaints`, `towers`, `alerts`, `aiChat`, `auth`, `connection`) |
| Maps | React-Leaflet + OpenStreetMap + `leaflet.heat` |
| Charts | Recharts |
| Graph | D3 (`d3-force`, `d3-zoom`, `d3-selection`, `d3-drag`) |
| 3D | Three.js + `@react-three/fiber` + `drei` |
| Real-time | `socket.io-client` |
| Offline | `vite-plugin-pwa` + Workbox + `idb-keyval` |
| HTTP | Axios (JWT interceptor) |

---

## Quick start

### Prerequisites
- Node.js 18+ and npm
- Docker + Docker Compose (for Postgres, Qdrant, Redis)
- A free **Groq API key** ([console.groq.com](https://console.groq.com)) — required for AI agents

### 1. Clone & configure
```bash
git clone <repo-url> drishti && cd drishti
cp .env.example .env
# edit .env and set GROQ_API_KEY and JWT_SECRET (others have sane local defaults)
```

### 2. Start infrastructure
```bash
docker compose up -d        # postgres + qdrant + redis
```

### 3. Backend (terminal 1)
```bash
cd backend && npm install && npm run dev    # → http://localhost:4000
```
On first boot it runs migrations and seeds 20 mock towers across India.

### 4. Frontend (terminal 2)
```bash
cd frontend && npm install && npm run dev    # → http://localhost:3000
```

### 5. Log in
Open http://localhost:3000 — the demo credentials are pre-filled:

> **Email:** `admin@drishti.com`  **Password:** `drishti@123`

### 6. Try it
Use the **Ingestion Panel** (sidebar) to drag in the files under [`sample-data/`](sample-data/)
(`complaint_bandra.pdf`, `complaints.csv`). Watch complaints flow into the feed, cluster on the
map, and generate recommendations in the approvals drawer. Ask the NL chat bar a question like
_"Which towers have the most call-drop complaints?"_

---

## Environment variables

All config lives in a single root `.env` (loaded by `backend/src/env.ts`). **Never commit `.env`.**
Full template is in [`.env.example`](.env.example). The essentials:

| Variable | Required | Default / notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Local docker value provided in `.env.example` |
| `REDIS_URL` | ✅ | `redis://localhost:6379` for local docker |
| `QDRANT_URL` | ✅ | `http://localhost:6333` for local docker |
| `EMBED_PROVIDER` | ✅ | `local` (free, offline) or `voyage` |
| `EMBED_DIM` | ✅ | `384` for local, `512` for voyage |
| `GROQ_API_KEY` | ✅ | Primary LLM — free tier at console.groq.com |
| `GEMINI_API_KEY` | ⬜ | Fallback + image vision (must be an `AIza…` key) |
| `TOGETHER_API_KEY` | ⬜ | Secondary LLM fallback |
| `JWT_SECRET` | ✅ | Long random string |
| `IMAP_*` | ⬜ | Only needed for live email ingestion |
| `PORT` / `FRONTEND_URL` | ⬜ | `4000` / `http://localhost:3000` (CORS) |

---

## Project structure

```
drishti/
├── docker-compose.yml        # postgres + qdrant + redis (local dev)
├── render.yaml               # backend deploy config
├── .env.example
├── sample-data/              # demo PDF + CSV to ingest
│
├── backend/src/
│   ├── index.ts              # entry — bootstraps everything
│   ├── env.ts                # loads root ../.env
│   ├── llm/                  # provider router: groq.ts, gemini.ts, together.ts, router.ts
│   ├── agents/               # ingestion, pattern, nlQuery, approval (+ agentRunner)
│   ├── rag/                  # chunker, embedder, indexer, retriever
│   ├── parsers/              # pdf, csv, image, email
│   ├── queue/                # BullMQ worker + jobs
│   ├── routes/               # auth, complaints, towers, alerts, ingest, recommendations, ai
│   ├── websocket/            # Socket.io server + typed emitters
│   ├── db/                   # postgres pool, qdrant client, migrations/
│   ├── middleware/           # auth (JWT), errorHandler
│   └── utils/                # logger, geocoder
│
└── frontend/src/
    ├── pages/                # Login, Dashboard
    ├── components/
    │   ├── layout/           # Layout, TopBar, Sidebar
    │   ├── map/              # DrishtiMap, TowerMarker, ComplaintHeatmap
    │   ├── complaints/       # ComplaintFeed, ComplaintCard, IngestionPanel
    │   ├── analytics/        # AnalyticsPanel, IssueBreakdown, TrendChart
    │   ├── ai/               # NLQueryChat, ChatMessage, RecommendationCard
    │   ├── approval/         # ApprovalPanel, ApprovalCard
    │   ├── ontology/         # OntologyGraph (D3), OntologyModal
    │   ├── simulation/       # SimulationModal, simulate.ts (what-if)
    │   ├── three/            # TowerScene, ThreeDModal (R3F 3D)
    │   └── ErrorBoundary.tsx
    ├── stores/               # Zustand: auth, complaints, towers, alerts, aiChat, connection
    ├── services/             # api.ts (axios+JWT), socket.ts, idbStorage.ts
    └── hooks/                # useComplaints, useTowers, useAlerts, useOfflineStatus
```

---

## How the pipeline works

1. **Ingest** — a file/email hits `POST /ingest`; an `ingest` BullMQ job is queued. The
   **Ingestion Agent** parses it, classifies issue type + severity, geocodes the location,
   embeds the text (local MiniLM) into Qdrant, and stores the complaint in Postgres.
2. **Pattern** — every N complaints (or on demand), the **Pattern Agent** clusters similar
   complaints by location/issue, correlates each cluster to the nearest tower, and emits a
   **recommendation** (root cause + suggested action + confidence).
3. **Query** — `POST /ai/chat` runs the **NL Query Agent**: retrieve top-K chunks from Qdrant,
   ground the LLM answer in them, and return optional `map_highlights` / `chart_data`.
4. **Approve** — the operator approves/rejects from the drawer; the **Approval Agent**
   updates statuses and opens a resolution ticket. (Approve/resolve are deterministic DB
   operations — they work even with no AI provider configured.)

**LLM router** (`backend/src/llm/`): `runLLMAgent(task, system, user, tools, executor, opts)`
tries providers in order, skips ones without keys, retries Groq 400s once, and supports
`forceTool` (single-call mode used by `classify`). Tool definitions are Anthropic-shaped and
converted to OpenAI/Gemini function-calling formats internally.

---

## API reference

```
POST   /auth/login                    → { token, operator }
GET    /auth/me                       → operator profile

GET    /complaints                    → paginated list + filters
GET    /complaints/:id                → single complaint detail
POST   /ingest                        → multipart file upload

GET    /towers                        → all towers + status
GET    /towers/:id                    → tower detail + linked complaints

GET    /alerts                        → paginated alerts (unread first)
PATCH  /alerts/:id/read               → mark read

GET    /recommendations               → pending recommendations
PATCH  /recommendations/:id/approve   → approve (optional note)
PATCH  /recommendations/:id/reject    → reject (optional note)
PATCH  /recommendations/:id/escalate  → escalate to admin

POST   /ai/chat                       → NL query → RAG → grounded answer
```

All routes except `/auth/login` require `Authorization: Bearer <token>`.

---

## Real-time events

Socket.io event names — backend emits, frontend listens (must stay identical on both sides):

| Event | Payload |
|---|---|
| `complaint:new` | `{ complaint }` |
| `alert:new` | `{ alert }` |
| `recommendation:ready` | `{ recommendation }` |
| `tower:status:changed` | `{ tower_id, status }` |
| `complaint:resolved` | `{ complaint }` |

The frontend `services/socket.ts` routes each event into the matching Zustand store.

---

## Development & conventions

```bash
# Type-check / build before committing
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit && npm run build
```

- **TypeScript everywhere** — no `.js` files; avoid `any`.
- **Follow the folder structure** above; keep `frontend/src/types` in sync with `backend/src/types`.
- **Design system** — use the exact theme tokens (dark navy bg, amber accent, status colors) defined in `tailwind.config` / `CLAUDE.md`; don't introduce ad-hoc hex values.
- **All API calls** go through `services/api.ts` (the axios instance with the JWT interceptor).
- **All routes** use try/catch + the `errorHandler` middleware.
- **Commits** are written in plain human style — no AI/co-author trailer lines.

### Branching
```
feat/<name>/<short-description>
fix/<name>/<short-description>
chore/<name>/<short-description>
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Agents return errors / nothing classifies | `GROQ_API_KEY` missing or daily free quota hit (~100K tokens/day, ~30 req/min). Add a `GEMINI_API_KEY` fallback or wait for reset. |
| Bulk ingest is slow | Intentional — worker concurrency is 1 with a 4/min limiter to respect the Groq free tier. |
| First RAG query is slow / model download | Local embeddings download a ~30MB model on first run (cached after). Failure is non-fatal — the complaint is still classified, just not RAG-searchable. |
| Can't connect to Postgres/Qdrant/Redis | Run `docker compose up -d` and confirm all three containers are healthy. |
| Redis connection refused on a locked-down network | The local Docker Redis avoids the commonly-blocked Upstash port; ensure 6379 is free locally. |
| 401 on every request | JWT missing/expired (8h). Log in again. |

---

## Deployment

Production targets (all free tier) — see [`render.yaml`](render.yaml):

| Layer | Service |
|---|---|
| Frontend | Vercel |
| Backend API | Render (sleeps after 15 min idle on free tier) |
| PostgreSQL | Supabase |
| Redis / BullMQ | Upstash (`rediss://`) |
| Vector DB | Qdrant Cloud |

Swap the local `.env` values for the production ones (Supabase `DATABASE_URL`, Upstash
`REDIS_URL`, Qdrant Cloud `QDRANT_URL` + `QDRANT_API_KEY`) and set `NODE_ENV=production`.

---

### Key divergences from the original plan

This build intentionally diverges from the initial design doc for cost/offline reasons.
The `CLAUDE.md` has the full table; the short version:

| Original plan | Actual | Why |
|---|---|---|
| Claude API agents | Groq → Gemini → Together | Free tiers |
| Voyage AI embeddings (512-dim) | Local MiniLM (384-dim) | Free, offline, no rate limit |
| Upstash Redis locally | Local Redis via Docker | Avoids blocked port 6379 |
| JWT in memory only | JWT persisted to IndexedDB | Offline-first field use |

---

_Drishti is a portfolio project built to demonstrate production-grade frontend engineering —
geospatial overlays, simulation UIs, NL access layers, ontology viewers, and ingestion
dashboards that work in offline-first, low-bandwidth environments._
