# Deploying Drishti — AWS EC2 (backend) + Vercel (frontend)

This is the **production runbook** for the architecture you chose:

```
                    ┌─────────────────────────────────────────────┐
   Browser  ──TLS──▶│  Vercel (static frontend, Vite build)        │
                    └───────────────────┬─────────────────────────┘
                                        │ HTTPS + WSS  (VITE_API_URL)
                                        ▼
   api.yourdomain.com  ──TLS──▶ ┌───────────────────────────────┐
   (A-record → EC2 IP)          │  AWS EC2  (one host)           │
                                │  ┌──────┐  ┌─────────┐  ┌────┐ │
                                │  │Caddy │─▶│ backend │─▶│Qdr.│ │   ← docker-compose.prod.yml
                                │  └──────┘  └────┬────┘  └────┘ │
                                └────────────────┼──────────────┘
                                     external ▼ (managed, free tier)
                              Supabase (Postgres) · Upstash (Redis)
```

**Split:** Qdrant + backend + Caddy run on EC2. Postgres (Supabase) and Redis (Upstash)
stay managed — you get free backups and don't own recovery. Frontend is static on Vercel.

---

## 0. Before you start — pick the right instance ⚠️

The backend loads an on-device embedding model (`@xenova/transformers`, ~30 MB on disk
but materialised in RAM) **and** runs a BullMQ worker, alongside Qdrant + Caddy on the
same box.

| Instance | RAM | Verdict |
|---|---|---|
| `t3.micro` / `t2.micro` (free tier) | 1 GB | ❌ Will OOM-kill Node under load. Don't. |
| **`t3.small`** | 2 GB | ✅ Minimum. Fine for demo/portfolio traffic. |
| `t3.medium` | 4 GB | ✅ Comfortable headroom. |

Cost is ~$15–30/mo. **Stop the instance when idle** to save money (Elastic IP keeps the
address; see §7).

You also need:
- A **domain** (or subdomain) you control, e.g. `api.yourdomain.com` — Caddy needs it to
  issue a Let's Encrypt cert. Caddy **cannot** get a cert for a bare IP.
- Free accounts on **Supabase** (Postgres) and **Upstash** (Redis).
- A **Vercel** account.

---

## 1. Provision the managed data stores (do this first)

### Supabase (Postgres)
1. Create a project → wait for it to spin up.
2. **Connection string:** Project → *Connect* → **use the "Connection pooling" / Transaction
   or Session string**, NOT the raw "Direct connection" one.
   - The direct (`db.<ref>.supabase.co:5432`) host is **IPv6-only** on new projects; EC2's
     default VPC may not route IPv6, so the connection hangs. The **pooler** host
     (`aws-0-<region>.pooler.supabase.com`) is IPv4 — use it.
3. Append `?sslmode=require` so **Prisma** uses TLS (the raw `pg` pool already forces SSL for
   non-local hosts, but Prisma reads the URL verbatim). Final form:
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```
   > If you use the **transaction** pooler (port `6543`) instead of session (`5432`), also add
   > `&pgbouncer=true&connection_limit=1` — pgBouncer transaction mode breaks Prisma's prepared
   > statements otherwise. Session mode (5432) needs neither; prefer it here.

You do **not** need to run the schema by hand — the backend runs `001_init.sql` on boot
(`runMigrations()`), seeds 20 towers, and seeds the admin operator automatically.

### Upstash (Redis)
1. Create a database → copy the **`rediss://` TLS URL** (port 6379).
2. TLS is auto-enabled by the app because the scheme is `rediss://`.
   ```
   REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
   ```

---

## 2. Launch the EC2 instance

1. **AMI:** Ubuntu 24.04 LTS. **Type:** `t3.small` (see §0). **Disk:** 20 GB gp3.
2. **Security group — inbound rules (only these):**
   | Port | Source | Why |
   |---|---|---|
   | 22 | *your IP only* | SSH |
   | 80 | 0.0.0.0/0 | Caddy → Let's Encrypt HTTP-01 challenge + redirect |
   | 443 | 0.0.0.0/0 | HTTPS + WSS API traffic |

   **Do NOT open 6333 (Qdrant) or 4000 (backend).** The compose file never publishes them —
   they're reachable only inside the Docker network. Keep it that way.
3. Allocate an **Elastic IP** and associate it with the instance (so the IP survives stop/start).

---

## 3. Point DNS at the host

Create an **A record**: `api.yourdomain.com → <Elastic IP>`. Wait for it to resolve
(`dig +short api.yourdomain.com` should return your IP) **before** §6 — Caddy's cert issuance
will fail until DNS is live.

---

## 4. Install Docker on the host

```bash
ssh ubuntu@<elastic-ip>

# Docker Engine + compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # or log out/in so the group applies

docker --version && docker compose version
```

---

## 5. Get the code + secrets onto the host

```bash
git clone <your-repo-url> drishti
cd drishti

cp .env.prod.example .env.prod
nano .env.prod          # fill in EVERY value — see the checklist below
```

`.env.prod` checklist (all required unless noted):

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler string from §1 (with `?sslmode=require`) |
| `REDIS_URL` | Upstash `rediss://` string from §1 |
| `EMBED_DIM` | `384` |
| `EMBED_MODEL` | `Xenova/all-MiniLM-L6-v2` |
| `GROQ_API_KEY` | from console.groq.com (free). Add `GROQ_API_KEY_2/3` to pool daily quota. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | optional fallback; leave blank to skip |
| `JWT_SECRET` | **generate a strong one:** `openssl rand -base64 48` — do NOT reuse the dev value |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://drishti.vercel.app` (set after §8; can redeploy) |

> `QDRANT_URL` is **not** in `.env.prod` — it's hard-set to `http://qdrant:6333` in the compose
> file (the sibling container).

Then set your domain in the Caddyfile:
```bash
nano Caddyfile        # replace api.example.com with api.yourdomain.com
```

---

## 6. Bring the stack up

```bash
docker compose -f docker-compose.prod.yml up -d --build

# Watch boot: migrations → Qdrant collection → seed towers/operator → workers → listen
docker compose -f docker-compose.prod.yml logs -f backend
```

Verify:
```bash
# From the host — backend health via Caddy (TLS should already be provisioned):
curl https://api.yourdomain.com/health      # → {"status":"ok"} (or similar)

# Caddy cert issuance log, if HTTPS isn't working:
docker compose -f docker-compose.prod.yml logs caddy | grep -i "certificate\|error"
```

If cert issuance fails: DNS isn't resolving to this host yet (§3), or port 80 is blocked (§2).

---

## 7. Deploy the frontend to Vercel

1. Import the repo in Vercel. **Set Root Directory = `frontend`** (the `vercel.json` and Vite
   config live there). Framework auto-detects as Vite.
2. **Environment variable** (Production):
   ```
   VITE_API_URL = https://api.yourdomain.com
   ```
   This is read at **build time** by both `services/api.ts` and `services/socket.ts`. If you
   change it later you must **redeploy** (it's baked into the bundle, not runtime).
3. Deploy. Note the resulting URL (e.g. `https://drishti.vercel.app`).

---

## 8. Close the CORS loop

The backend's CORS + Socket.io origin is `FRONTEND_URL`. Now that you have the Vercel URL:

```bash
# on EC2
nano .env.prod                                   # set FRONTEND_URL=https://drishti.vercel.app
docker compose -f docker-compose.prod.yml up -d  # recreates backend with the new env
```

Open the Vercel URL, log in with **`admin@drishti.com` / `drishti@123`** (seeded), and confirm:
- the LIVE indicator turns green (Socket.io connected over WSS),
- the map loads towers, ingestion + chat work.

---

## 9. Stopping to save cost / restarting

```bash
# Stop the instance from the AWS console (Elastic IP is retained).
# On restart, bring the stack back (data persists in named volumes):
cd drishti && docker compose -f docker-compose.prod.yml up -d
```

Qdrant vectors persist in the `qdrant_data` volume; Caddy certs in `caddy_data`. Postgres/Redis
are external, so nothing is lost on instance stop.

---

## Operational notes

- **Logs:** `docker compose -f docker-compose.prod.yml logs -f <service>`
- **Redeploy after a code push:**
  ```bash
  git pull && docker compose -f docker-compose.prod.yml up -d --build
  ```
- **Embedding model download** happens once on first use (~30 MB) into the container's
  `/app/.cache`. It re-downloads if the container is rebuilt; mount a volume on `/app/.cache`
  if you want to persist it across rebuilds.
- **Groq free tier** is ~100K tokens/day + ~30 req/min. Multiple `GROQ_API_KEY_*` keys pool the
  quota; the worker is throttled (concurrency 1) to stay under limits.

## Known stale artifact

`render.yaml` describes an **alternative** Render + Vercel deploy and is **out of date** — it
references the removed `VOYAGE_API_KEY` and is missing `GROQ_API_KEY_2/3`, `GROQ_MODEL`,
`EMBED_DIM`, `EMBED_MODEL`, and `GEMINI_API_KEY`. It is **not** used by this EC2 runbook. Either
ignore it or delete it to avoid confusion. (Render free tier also sleeps after 15 min inactivity
and its 512 MB instances would OOM with the local embedding model — another reason EC2 is the
better fit here.)
