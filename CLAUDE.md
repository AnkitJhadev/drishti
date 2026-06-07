# Drishti — Telecom AI Operations Platform
> "From complaint to resolution — intelligently."

## What is Drishti?
A full-stack AI platform where telecom operators ingest customer complaints from multiple channels
(email, PDF, image, SMS, CSV), AI agents automatically detect patterns, correlate affected towers,
generate recommendations, and present everything in a production-grade operations dashboard.

**This project is a portfolio piece for a Frontend Engineer role at Sarvam AI (Chanakya vertical).**
The UI must be production-ready. The backend must be functional. It should feel like a real enterprise product.

---

## Product Context — Why This Exists
Telecom operators receive thousands of complaints daily across many channels. Today humans manually
read, categorize, and locate issues. Drishti automates this entire pipeline using AI agents, correlates
complaints to tower infrastructure, and gives operators a single intelligent dashboard to monitor,
query, and resolve issues.

---

## Tech Stack

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Job Queue**: BullMQ + Upstash Redis (async multi-agent pipeline)
- **Primary DB**: PostgreSQL via Supabase (local: Docker postgres)
- **Vector DB**: Qdrant Cloud free tier (local: Docker qdrant)
- **Embeddings**: Voyage AI — voyage-3-lite model (200M free tokens, production ready)
- **LLM**: Claude API (claude-sonnet-4-20250514) via @anthropic-ai/sdk
- **Email ingestion**: imapflow + mailparser (IMAP polling every 30s)
- **File parsing**: pdf-parse (PDF), papaparse (CSV), tesseract.js + sharp (images)
- **Auth**: JWT + bcryptjs (8hr expiry, stored in memory on frontend)
- **Real-time**: Socket.io (WebSocket server)
- **File uploads**: Multer
- **Logging**: Winston

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS (dark ops theme — see Design System below)
- **State**: Zustand (4 stores: complaints, towers, alerts, aiChat)
- **Maps**: React-Leaflet + OpenStreetMap (free, no API key needed)
- **Charts**: Recharts
- **Real-time**: Socket.io-client
- **PWA**: vite-plugin-pwa + Workbox (offline-first)
- **HTTP**: Axios

### Infrastructure — Local Dev
- Docker + docker-compose (one command: `docker-compose up`)
- Services: postgres, qdrant (Redis is Upstash even locally via env var)

### Infrastructure — Production
| Service | Tool | Cost |
|---|---|---|
| Frontend | Vercel | Free |
| Backend API | Render (free web service) | Free (sleeps after 15min inactivity) |
| PostgreSQL | Supabase (free tier) | Free (500MB) |
| Redis / BullMQ | Upstash Redis (free tier) | Free (10K cmds/day) |
| Vector DB | Qdrant Cloud (free tier) | Free (1GB RAM, 4GB disk) |
| Embeddings | Voyage AI | Free (200M tokens) |
| LLM | Claude API | Your subscription |
| **Total** | | **₹0** |

---

## Monorepo Structure

```
drishti/
├── CLAUDE.md                              ← you are here
├── docker-compose.yml                     ← local dev only (postgres + qdrant)
├── .env.example
├── .env                                   ← never commit this
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                       ← entry point, bootstraps everything
│       ├── types/
│       │   ├── complaint.ts
│       │   ├── tower.ts
│       │   ├── alert.ts
│       │   └── ai.ts
│       ├── db/
│       │   ├── postgres.ts                ← pg pool + run migrations
│       │   ├── qdrant.ts                  ← qdrant client setup
│       │   └── migrations/
│       │       └── 001_init.sql           ← full schema
│       ├── queue/
│       │   ├── worker.ts                  ← BullMQ worker registration
│       │   └── jobs/
│       │       ├── ingestJob.ts           ← add complaint to queue
│       │       ├── classifyJob.ts         ← trigger classification
│       │       └── clusterJob.ts          ← trigger clustering
│       ├── agents/
│       │   ├── agentRunner.ts             ← core Claude tool-calling loop
│       │   ├── ingestionAgent.ts          ← parse + classify + embed + store
│       │   ├── patternAgent.ts            ← cluster + tower correlation + recommend
│       │   ├── nlQueryAgent.ts            ← RAG + grounded answer + map/chart hints
│       │   └── approvalAgent.ts           ← human-in-loop status updates
│       ├── rag/
│       │   ├── chunker.ts                 ← document-aware hybrid chunking
│       │   ├── embedder.ts                ← Voyage AI embeddings
│       │   ├── indexer.ts                 ← store chunks in Qdrant
│       │   └── retriever.ts               ← cosine similarity search, top K
│       ├── parsers/
│       │   ├── emailParser.ts             ← imapflow + mailparser
│       │   ├── pdfParser.ts               ← pdf-parse
│       │   ├── imageParser.ts             ← tesseract.js + sharp + Claude vision
│       │   └── csvParser.ts               ← papaparse
│       ├── services/
│       │   └── email/
│       │       ├── imapPoller.ts          ← polls Gmail/Outlook inbox every 30s
│       │       └── index.ts               ← start/stop poller
│       ├── routes/
│       │   ├── auth.ts                    ← POST /auth/login, GET /auth/me
│       │   ├── complaints.ts              ← GET /complaints, GET /complaints/:id
│       │   ├── towers.ts                  ← GET /towers, GET /towers/:id
│       │   ├── alerts.ts                  ← GET /alerts, PATCH /alerts/:id/read
│       │   ├── ingest.ts                  ← POST /ingest (multipart file upload)
│       │   ├── recommendations.ts         ← GET /recommendations, PATCH /:id/approve|reject
│       │   └── ai.ts                      ← POST /ai/chat
│       ├── websocket/
│       │   └── wsServer.ts                ← Socket.io server + typed event emitters
│       ├── middleware/
│       │   ├── auth.ts                    ← JWT verify middleware
│       │   └── errorHandler.ts            ← global error handler
│       └── utils/
│           ├── logger.ts                  ← Winston logger
│           └── geocoder.ts                ← location text → [lat, lng] coordinates
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx                        ← routes: /login, /dashboard
        ├── types/                         ← mirror of backend types (keep in sync)
        │   ├── complaint.ts
        │   ├── tower.ts
        │   ├── alert.ts
        │   └── ai.ts
        ├── stores/
        │   ├── authStore.ts               ← token + operator (in memory only)
        │   ├── complaintsStore.ts
        │   ├── towersStore.ts
        │   ├── alertsStore.ts
        │   └── aiChatStore.ts
        ├── services/
        │   ├── api.ts                     ← axios instance with JWT interceptor
        │   └── socket.ts                  ← socket.io-client singleton
        ├── hooks/
        │   ├── useComplaints.ts
        │   ├── useTowers.ts
        │   ├── useAlerts.ts
        │   └── useOfflineStatus.ts
        ├── components/
        │   ├── layout/
        │   │   ├── Layout.tsx             ← shell: topbar + sidebar + main content
        │   │   ├── TopBar.tsx             ← logo, live indicator, offline badge
        │   │   └── Sidebar.tsx            ← nav links + alerts feed
        │   ├── map/
        │   │   ├── DrishtiMap.tsx         ← React-Leaflet map container
        │   │   ├── TowerMarker.tsx        ← colored pin by tower status
        │   │   └── ComplaintHeatmap.tsx   ← leaflet.heat density overlay
        │   ├── complaints/
        │   │   ├── ComplaintFeed.tsx      ← live scrolling complaint list
        │   │   ├── ComplaintCard.tsx      ← single complaint row with severity badge
        │   │   └── IngestionPanel.tsx     ← drag+drop multi-file upload UI
        │   ├── analytics/
        │   │   ├── AnalyticsPanel.tsx     ← charts container with tabs
        │   │   ├── IssueBreakdown.tsx     ← pie/bar chart by issue type
        │   │   └── TrendChart.tsx         ← line chart: complaints over time
        │   ├── ai/
        │   │   ├── NLQueryChat.tsx        ← chat interface: input + message list
        │   │   ├── ChatMessage.tsx        ← single message bubble (user/assistant)
        │   │   └── RecommendationCard.tsx ← AI recommendation with confidence score
        │   └── approval/
        │       ├── ApprovalPanel.tsx      ← list of pending AI recommendations
        │       └── ApprovalCard.tsx       ← approve / reject / escalate with note
        └── pages/
            ├── Login.tsx                  ← full page login form
            └── Dashboard.tsx              ← composes all panels into layout
```

---

## Database Schema (PostgreSQL)

Run this as `backend/src/db/migrations/001_init.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE operators (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            VARCHAR(20) DEFAULT 'operator',  -- operator | admin
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login      TIMESTAMPTZ
);

CREATE TABLE towers (
  id                   VARCHAR(50) PRIMARY KEY,     -- e.g. "T-104"
  name                 VARCHAR(255) NOT NULL,
  coordinates          POINT NOT NULL,              -- (lat, lng)
  status               VARCHAR(30) DEFAULT 'operational', -- operational | degraded | critical | offline
  coverage_radius_km   FLOAT DEFAULT 2.0,
  active_complaints    INT DEFAULT 0,
  affected_users       INT DEFAULT 0,
  last_checked         TIMESTAMPTZ DEFAULT NOW(),
  metadata             JSONB
);

CREATE TABLE complaints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(20) NOT NULL,             -- email | pdf | image | sms | csv
  raw_text        TEXT NOT NULL,
  location_hint   VARCHAR(255),
  coordinates     POINT,
  sender          VARCHAR(255),
  timestamp       TIMESTAMPTZ DEFAULT NOW(),
  status          VARCHAR(30) DEFAULT 'pending',    -- pending | processing | clustered | recommended | approved | rejected | resolved
  issue_type      VARCHAR(50),                      -- network_outage | call_drop | slow_internet | tower_failure | billing_issue | unknown
  severity        VARCHAR(20),                      -- low | medium | high | critical
  confidence      FLOAT,
  cluster_id      UUID,
  tower_id        VARCHAR(50) REFERENCES towers(id),
  media_url       TEXT,
  metadata        JSONB
);

CREATE TABLE clusters (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type          VARCHAR(50) NOT NULL,
  size                INT DEFAULT 0,
  center_coordinates  POINT,
  radius_km           FLOAT,
  tower_id            VARCHAR(50) REFERENCES towers(id),
  status              VARCHAR(30) DEFAULT 'open',   -- open | actioned | resolved
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recommendations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id       UUID REFERENCES clusters(id),
  tower_id         VARCHAR(50) REFERENCES towers(id),
  root_cause       TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  affected_users   INT DEFAULT 0,
  priority         VARCHAR(20) NOT NULL,             -- low | medium | high | critical
  confidence       FLOAT,
  status           VARCHAR(20) DEFAULT 'pending',    -- pending | approved | rejected
  operator_note    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      VARCHAR(255)
);

CREATE TABLE alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             VARCHAR(50) NOT NULL,             -- new_cluster | tower_degraded | spike_detected | recommendation_ready | approval_pending
  severity         VARCHAR(20) NOT NULL,             -- info | warning | critical
  title            VARCHAR(255) NOT NULL,
  message          TEXT NOT NULL,
  tower_id         VARCHAR(50) REFERENCES towers(id),
  cluster_id       UUID REFERENCES clusters(id),
  read             BOOLEAN DEFAULT FALSE,
  action_required  BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE resolutions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id   UUID REFERENCES recommendations(id),
  tower_id            VARCHAR(50) REFERENCES towers(id),
  cluster_id          UUID REFERENCES clusters(id),
  status              VARCHAR(30) DEFAULT 'open',   -- open | in_progress | resolved
  assigned_to         VARCHAR(255),
  resolved_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id      UUID REFERENCES operators(id),
  role             VARCHAR(20) NOT NULL,             -- user | assistant
  content          TEXT NOT NULL,
  map_highlights   JSONB,                            -- array of tower IDs to highlight
  chart_data       JSONB,                            -- { label: value } for chart rendering
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_cluster_id ON complaints(cluster_id);
CREATE INDEX idx_complaints_tower_id ON complaints(tower_id);
CREATE INDEX idx_complaints_timestamp ON complaints(timestamp DESC);
CREATE INDEX idx_alerts_read ON alerts(read);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_recommendations_status ON recommendations(status);
```

---

## TypeScript Types

### `types/complaint.ts`
```typescript
export type ComplaintSource = 'email' | 'pdf' | 'image' | 'sms' | 'csv'

export type IssueType =
  | 'network_outage'
  | 'call_drop'
  | 'slow_internet'
  | 'tower_failure'
  | 'billing_issue'
  | 'unknown'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type ComplaintStatus =
  | 'pending'
  | 'processing'
  | 'clustered'
  | 'recommended'
  | 'approved'
  | 'rejected'
  | 'resolved'

export interface ComplaintRecord {
  id: string
  source: ComplaintSource
  raw_text: string
  location_hint: string
  timestamp: string       // ISO8601
  sender: string
  status: ComplaintStatus
  media_url?: string
}

export interface EnrichedComplaint extends ComplaintRecord {
  issue_type: IssueType
  severity: Severity
  coordinates: [number, number]   // [lat, lng]
  cluster_id?: string
  tower_id?: string
  confidence: number              // 0–1
}
```

### `types/tower.ts`
```typescript
export type TowerStatus = 'operational' | 'degraded' | 'critical' | 'offline'

export type TowerIssueType =
  | 'power_failure'
  | 'hardware_fault'
  | 'overload'
  | 'maintenance'
  | 'unknown'

export interface Tower {
  id: string
  name: string
  coordinates: [number, number]
  status: TowerStatus
  active_complaints: number
  affected_users: number
  last_checked: string
  coverage_radius_km: number
}

export interface TowerDetail extends Tower {
  issue_type?: TowerIssueType
  recommendation?: string
  cluster_ids: string[]
}
```

### `types/alert.ts`
```typescript
export type AlertSeverity = 'info' | 'warning' | 'critical'

export type AlertType =
  | 'new_cluster'
  | 'tower_degraded'
  | 'spike_detected'
  | 'recommendation_ready'
  | 'approval_pending'

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  timestamp: string
  read: boolean
  tower_id?: string
  cluster_id?: string
  action_required: boolean
}
```

### `types/ai.ts`
```typescript
export interface ComplaintCluster {
  id: string
  issue_type: string
  complaint_ids: string[]
  size: number
  center_coordinates: [number, number]
  radius_km: number
  tower_id?: string
  created_at: string
}

export interface AIRecommendation {
  id: string
  cluster_id: string
  tower_id: string
  root_cause: string
  suggested_action: string
  affected_users: number
  priority: string
  confidence: number
  status: 'pending' | 'approved' | 'rejected'
  operator_note?: string
  created_at: string
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: string
  map_highlights?: string[]               // tower IDs to highlight on map
  chart_data?: Record<string, number>     // data for inline chart
}
```

---

## Agent Architecture

All 4 agents use Claude API tool calling. Core loop in `agentRunner.ts`:

```typescript
// agentRunner.ts — core loop (never modify this pattern)
export async function runAgent(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ]

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages
    })

    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock
      const toolResult = await toolExecutor(toolUseBlock.name, toolUseBlock.input as Record<string, unknown>)

      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult)
        }]
      })
      continue
    }

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock
      return textBlock?.text ?? ''
    }

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`)
  }
}
```

### Agent 1 — Ingestion Agent (`ingestionAgent.ts`)
Triggered by BullMQ `ingest` queue job.
Tools: `parse_document`, `extract_location`, `classify_issue`, `save_complaint`, `embed_and_index`

### Agent 2 — Pattern Agent (`patternAgent.ts`)
Triggered every 10 new complaints OR on demand.
Tools: `get_recent_complaints`, `cluster_by_location`, `cluster_by_issue`, `correlate_to_tower`, `generate_recommendation`, `create_alert`

### Agent 3 — NL Query Agent (`nlQueryAgent.ts`)
Triggered by POST /ai/chat.
Tools: `search_rag_store`, `get_complaints_by_filter`, `get_tower_status`, `get_cluster_summary`
Returns: answer text + optional `map_highlights` + optional `chart_data`

### Agent 4 — Approval Agent (`approvalAgent.ts`)
Triggered by PATCH /recommendations/:id/approve|reject.
Tools: `update_recommendation_status`, `update_tower_status`, `update_cluster_status`, `create_resolution_ticket`, `create_alert`

---

## RAG Pipeline

```
Text input (complaint / PDF / CSV)
          ↓
chunker.ts — document-aware hybrid strategy:
  SMS / email (<150 words)  → whole text = 1 chunk
  CSV                       → 1 row = 1 chunk
  PDF (short, <300 words)   → sentence chunking
  PDF (long)                → detect section headings first
                               then sentence chunk each section
  Default                   → sentence chunking
  Sentence chunk params: maxTokens=200, overlap=50
          ↓
embedder.ts — Voyage AI (voyage-3-lite)
  POST https://api.voyageai.com/v1/embeddings
  Supports batch embedding for efficiency
          ↓
indexer.ts — Qdrant collection: "drishti_docs"
  Payload stored: { text, source_id, source_type, location_hint, chunk_index }
          ↓
retriever.ts — cosine similarity search
  Returns top 5 chunks with scores
          ↓
nlQueryAgent.ts — builds prompt with context
  Claude answers from retrieved chunks only
  Hallucinates nothing — if not in context, says so
```

---

## WebSocket Events

```typescript
// wsServer.ts — backend emits these exact event names
// Frontend must listen on these exact names in socket.ts

socket.emit('complaint:new',           { complaint: EnrichedComplaint })
socket.emit('cluster:detected',        { cluster: ComplaintCluster })
socket.emit('recommendation:ready',    { recommendation: AIRecommendation })
socket.emit('alert:new',               { alert: Alert })
socket.emit('tower:status:changed',    { tower_id: string, status: TowerStatus })

// Frontend (socket.ts) listens and updates Zustand stores:
socket.on('complaint:new',          (data) => complaintsStore.getState().addComplaint(data.complaint))
socket.on('alert:new',              (data) => alertsStore.getState().addAlert(data.alert))
socket.on('recommendation:ready',   (data) => aiChatStore.getState().addRecommendation(data.recommendation))
socket.on('tower:status:changed',   (data) => towersStore.getState().updateTowerStatus(data.tower_id, data.status))
```

---

## Auth Flow

```
POST /auth/login { email, password }
  → bcrypt.compare(password, hash)
  → jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '8h' })
  → returns { token, operator }

Frontend:
  → stores token in authStore (Zustand, in memory — NEVER localStorage)
  → api.ts axios interceptor adds: Authorization: Bearer <token>

Backend middleware (middleware/auth.ts):
  → jwt.verify(token, JWT_SECRET)
  → attaches operator to req.operator
  → 401 if missing or invalid
```

---

## Voyage AI — Embedder

```typescript
// rag/embedder.ts
import VoyageAI from 'voyageai'

const voyage = new VoyageAI({ apiKey: process.env.VOYAGE_API_KEY! })

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await voyage.embed({
    input: text,
    model: process.env.VOYAGE_EMBED_MODEL ?? 'voyage-3-lite'
  })
  return response.data[0].embedding
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await voyage.embed({
    input: texts,
    model: process.env.VOYAGE_EMBED_MODEL ?? 'voyage-3-lite'
  })
  return response.data.map((d: { embedding: number[] }) => d.embedding)
}
```

---

## Environment Variables

### `.env.example` (commit this) / `.env` (never commit)

```env
# ── Local Dev (docker-compose) ──────────────────────────
DATABASE_URL=postgresql://drishti_user:drishti_pass@localhost:5432/drishti

# ── Production ──────────────────────────────────────────
# DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Redis — Upstash (works for both local and prod)
REDIS_URL=rediss://:[password]@[host].upstash.io:6379

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                         # leave blank for local, fill for Qdrant Cloud
# QDRANT_URL=https://[id].[region].gcp.cloud.qdrant.io  # prod

# Voyage AI
VOYAGE_API_KEY=your-voyage-api-key
VOYAGE_EMBED_MODEL=voyage-3-lite

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key

# Auth
JWT_SECRET=change-this-to-a-long-random-string-in-production

# Email (IMAP) — optional, skip if not testing email ingestion
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=complaints@yourtelecom.com
IMAP_PASSWORD=your-gmail-app-password
IMAP_MAILBOX=INBOX
IMAP_POLL_INTERVAL_MS=30000

# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000      # for CORS
```

---

## docker-compose.yml (local dev only)

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: drishti
      POSTGRES_USER: drishti_user
      POSTGRES_PASSWORD: drishti_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U drishti_user -d drishti"]
      interval: 5s
      timeout: 5s
      retries: 5

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  postgres_data:
  qdrant_data:

# Note: Redis is Upstash — no local container needed
# Note: Run backend and frontend manually with npm run dev
```

---

## UI Design System

The UI must look like a **military command center** — dark, dense, high contrast. No decorative elements.

```
Background (page):      #0a0f1e   (deep navy)
Background (card):      #111827   (dark surface)
Background (elevated):  #1a2235   (slightly lighter card)
Border:                 #1f2937
Border (hover):         #374151

Primary accent:         #f59e0b   (amber)  — CTAs, active states, highlights
Success:                #10b981   (green)  — operational, resolved
Danger:                 #ef4444   (red)    — critical, offline
Warning:                #f97316   (orange) — degraded, high severity
Info:                   #3b82f6   (blue)   — info alerts, links

Text primary:           #f9fafb
Text secondary:         #9ca3af
Text muted:             #6b7280

Font family:            Inter, system-ui, sans-serif
Font sizes:             xs=11px, sm=12px, base=14px, lg=16px, xl=18px
Border radius:          sm=4px, md=6px, lg=8px

Severity badge colors:
  low       → #374151 bg, #9ca3af text
  medium    → #92400e bg, #fcd34d text
  high      → #7c2d12 bg, #fb923c text
  critical  → #7f1d1d bg, #f87171 text

Tower status colors:
  operational → #10b981 (green dot)
  degraded    → #f97316 (orange dot)
  critical    → #ef4444 (red dot, pulsing animation)
  offline     → #6b7280 (gray dot)
```

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ TOPBAR: [🔴 DRISHTI]  [● LIVE]  [WiFi/Offline]  [Operator ▾]  │
├──────────┬──────────────────────────────┬───────────────────────┤
│          │                              │                       │
│ SIDEBAR  │      GEOSPATIAL MAP          │   LIVE METRICS        │
│          │   (React-Leaflet)            │   (Recharts)          │
│ Nav      │   Tower pins + heatmap       │   Issue breakdown     │
│          │                              │   Trend over time     │
│ Alerts   │                              │                       │
│ Feed     ├──────────────────────────────┤                       │
│          │   COMPLAINT FEED             │                       │
│          │   (live, filterable)         │                       │
│          │                              │                       │
├──────────┴──────────────────────────────┴───────────────────────┤
│ NL QUERY: [Ask Drishti anything about your network...]  [Send] │
└─────────────────────────────────────────────────────────────────┘
```

Approval Panel slides in as a right drawer when there are pending recommendations.
Ingestion Panel is a modal triggered from the sidebar.

---

## Hackathon Build Order

Follow this exactly. Each hour produces something that works:

```
Hour 1  → Monorepo setup: package.json, tsconfig, Tailwind, Vite config, docker-compose
Hour 2  → DB: postgres connection, run migrations, seed 20 mock towers across India
Hour 3  → Auth: POST /auth/login, JWT middleware, Login page UI (production quality)
Hour 4  → Ingest routes: Multer upload, parsers (pdf, csv, image), normalizer
Hour 5  → BullMQ workers + Ingestion Agent (classify + embed via Voyage + store in Qdrant + postgres)
Hour 6  → Pattern Agent (cluster similar complaints + correlate to tower + generate recommendation)
Hour 7  → WebSocket server + frontend socket.ts + live complaint feed UI
Hour 8  → Map view: DrishtiMap + TowerMarker (colored by status) + ComplaintHeatmap
Hour 9  → Analytics panel: IssueBreakdown (pie) + TrendChart (line) using Recharts
Hour 10 → NL chat: RAG retrieval + Claude API + ChatMessage UI + map/chart hint rendering
Hour 11 → Approval panel: ApprovalCard with approve/reject/escalate + ApprovalAgent
Hour 12 → PWA (vite-plugin-pwa) + offline banner + final UI polish + deploy to Vercel + Render
```

---

## Seed Data — Mock Towers

Seed these 20 towers on startup if towers table is empty.
Spread across India: Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad.
Statuses: mix of operational (14), degraded (4), critical (1), offline (1).

---

## Key Decisions — Do NOT Revisit

- **No LangChain** — custom RAG only (cleaner, more impressive, fully understood)
- **No Mapbox** — React-Leaflet + OpenStreetMap (free, no API key)
- **No localStorage** — JWT in Zustand memory only (security)
- **No MongoDB** — PostgreSQL only (relational data fits perfectly)
- **No Ollama** — Voyage AI (production ready, 200M free tokens)
- **No Railway** — Render (backend) + Vercel (frontend) + Supabase (DB)
- **Upstash Redis** — not self-hosted (free, works in production)
- **Qdrant Cloud** — free forever tier for production vectors
- **Document-aware hybrid chunking** — not fixed token chunking
- **BullMQ** — for agent orchestration (not custom queues)
- **Socket.io** — for WebSocket (not raw WS)

---

## API Routes Reference

```
POST   /auth/login                    → { token, operator }
GET    /auth/me                       → operator profile

GET    /complaints                    → paginated list with filters
GET    /complaints/:id                → single complaint detail
POST   /ingest                        → multipart upload (any file type)

GET    /towers                        → all towers with status
GET    /towers/:id                    → tower detail + linked complaints

GET    /alerts                        → paginated alerts, unread first
PATCH  /alerts/:id/read               → mark as read

GET    /recommendations               → pending recommendations
PATCH  /recommendations/:id/approve   → approve with optional note
PATCH  /recommendations/:id/reject    → reject with optional note
PATCH  /recommendations/:id/escalate  → escalate to admin

POST   /ai/chat                       → NL query → RAG → grounded answer
```

---

## Notes for Claude Code

1. **Always TypeScript** — no `.js` files anywhere
2. **Follow folder structure exactly** as defined above
3. **Design system colors** — use the exact hex values above, nowhere else
4. **No `any` types** — every function and component fully typed
5. **Zustand stores** — follow the 4-store + authStore pattern
6. **All API calls** go through `services/api.ts` (axios instance with interceptor)
7. **Socket events** — use exact event names defined in WebSocket Events section
8. **Error handling** — all routes use try/catch + errorHandler middleware
9. **Mobile responsive** — dashboard collapses to single column on mobile
10. **When stuck** — re-read this file before asking questions
