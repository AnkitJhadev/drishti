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
                              Neon (Postgres) · Upstash (Redis)
```

**Split:** only backend + Caddy run on EC2 (fits the 1 GB free tier). Postgres (Neon),
Redis (Upstash) and Qdrant (Qdrant Cloud) are managed free tiers — you get backups and
don't own recovery. Frontend is static on Vercel.
(Qdrant Cloud was verified working end-to-end — the earlier failure was a malformed
cluster URL; it must end with `:6333` and carry the API key.)

---

## 0. Before you start — instance sizing ⚠️

The EC2 box runs only Caddy + the backend; Qdrant, Postgres and Redis are all managed.
On the free tier (1 GB RAM) still create **the 2 GB swap file in §4** — the embedding
model (~300 MB when loaded) plus a file upload must spill to swap instead of triggering
the OOM killer. Expect the occasional slow request when swap is in play; fine for
demo/portfolio traffic.

| Instance | RAM | Verdict |
|---|---|---|
| **`t3.micro` / `t2.micro`** (free tier) | 1 GB | ✅ Works **with the 2 GB swap file (§4)** — not optional. |
| `t3.small` | 2 GB | ✅ Comfortable, ~$15/mo — use it if your account has the credits-based free plan. |

> **Which free tier do you have?** Accounts created after mid-2025 get *credits*
> (~$100–200) instead of 12 months of micro instances. Credits run a `t3.small` for
> months — check Billing → Free tier in the console. Classic plan → `t3.micro`.

You also need:
- A **domain** (or subdomain) you control, e.g. `api.yourdomain.com` — Caddy needs it to
  issue a Let's Encrypt cert. Caddy **cannot** get a cert for a bare IP.
- Free accounts on **Neon** (Postgres) and **Upstash** (Redis).
- A **Vercel** account.

---

## 1. Provision the managed data stores (do this first)

### Neon (Postgres)
1. Create a project — pick the region closest to the EC2 region (no Mumbai on Neon;
   Singapore `ap-southeast-1` pairs well with EC2 `ap-south-1`).
2. **Connection string:** copy the **Direct** one (host *without* `-pooler`), not the
   Pooled one. The pooled endpoint is PgBouncer in transaction mode, which breaks
   Prisma's prepared statements unless you add `?pgbouncer=true&connection_limit=1`.
   A single backend instance with its own small pool doesn't need it.
3. Keep the `?sslmode=require` suffix Neon includes — **Prisma** reads the URL verbatim
   (the raw `pg` pool already forces SSL for non-local hosts on its own). Final form:
   ```
   DATABASE_URL=postgresql://neondb_owner:<password>@ep-<id>.<region>.aws.neon.tech/neondb?sslmode=require
   ```
   > Neon's free tier **suspends the compute after ~5 min idle**; the first query after a
   > suspend takes ~1s extra while it wakes. Harmless for this app — just don't mistake
   > the one-off slow request for a bug.

You do **not** need to run the schema by hand — the backend runs `001_init.sql` on boot
(`runMigrations()`), seeds 20 towers, and seeds the admin operator automatically.

### Upstash (Redis)
1. Create a database → copy the **`rediss://` TLS URL** (port 6379).
2. TLS is auto-enabled by the app because the scheme is `rediss://`.
   ```
   REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
   ```
   > ⚠️ **Quota note:** BullMQ polls Redis even when idle, and Upstash bills per command —
   > idle polling can chew through the free tier. If you hit quota errors, the fallback is
   > one compose stanza: add a `redis:` container to docker-compose.prod.yml and set
   > `REDIS_URL=redis://redis:6379` — free, local, no quota (costs ~10 MB RAM on the box).

### Qdrant Cloud (vectors)
1. Sign up at [cloud.qdrant.io](https://cloud.qdrant.io) → create a **free-tier cluster**
   (1 GB, free forever) — pick the region nearest your EC2 if offered.
2. Copy the **cluster URL** and create an **API key**. Two gotchas that make it look
   "broken": the URL must **end with `:6333`** and have **no trailing slash**.
   ```
   QDRANT_URL=https://<cluster-id>.<region>.aws.cloud.qdrant.io:6333
   QDRANT_API_KEY=<key>
   ```
   The backend creates the `drishti_docs` collection (dim 384) on first boot.

---

## 2. Launch the EC2 instance

1. **AMI:** Ubuntu 24.04 LTS. **Type:** `t3.micro` free tier (or `t3.small` on credits — §0).
   **Disk:** 20 GB gp3 (free tier includes 30 GB).
2. **Security group — inbound rules (only these):**
   | Port | Source | Why |
   |---|---|---|
   | 22 | *your IP only* | SSH |
   | 80 | 0.0.0.0/0 | Caddy → Let's Encrypt HTTP-01 challenge + redirect |
   | 443 | 0.0.0.0/0 | HTTPS + WSS API traffic |

   **Do NOT open 4000 (backend)** — the compose file never publishes it; only Caddy
   reaches it over the internal Docker network. Keep it that way.
3. Allocate an **Elastic IP** and associate it with the instance (so the IP survives stop/start).

---

## 3. Point DNS at the host

Create an **A record**: `api.yourdomain.com → <Elastic IP>`. Wait for it to resolve
(`dig +short api.yourdomain.com` should return your IP) **before** §6 — Caddy's cert issuance
will fail until DNS is live.

---

## 4. Prepare the host — swap first, then Docker

```bash
ssh ubuntu@<elastic-ip>

# ── 2 GB swap file (REQUIRED on a 1 GB instance — see §0) ──────────────
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # survive reboots
free -h    # should show Swap: 2.0Gi

# ── Docker Engine + compose plugin (official convenience script) ───────
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
| `DATABASE_URL` | Neon direct connection string from §1 (with `?sslmode=require`) |
| `REDIS_URL` | Upstash `rediss://` string from §1 |
| `QDRANT_URL` | Qdrant Cloud cluster URL from §1 — **must end `:6333`, no trailing slash** |
| `QDRANT_API_KEY` | Qdrant Cloud API key from §1 |
| `EMBED_DIM` | `384` |
| `EMBED_MODEL` | `Xenova/all-MiniLM-L6-v2` |
| `GROQ_API_KEY` | from console.groq.com (free). Add `GROQ_API_KEY_2/3` to pool daily quota. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | optional fallback; leave blank to skip |
| `JWT_SECRET` | **generate a strong one:** `openssl rand -base64 48` — do NOT reuse the dev value |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://drishti.vercel.app` (set after §8; can redeploy) |

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

Caddy certs persist in `caddy_data`; the embedding model in `hf_cache`. Postgres, Redis
and Qdrant are all external, so nothing is lost on instance stop.

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
