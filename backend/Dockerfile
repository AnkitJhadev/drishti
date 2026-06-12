# syntax=docker/dockerfile:1

# ── Stage 1: build (TypeScript → dist) ─────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install ALL deps (incl. dev: typescript) using the lockfile for reproducibility.
COPY package*.json ./
RUN npm ci

# Compile, then copy the SQL migration into dist (tsc only emits .ts → .js, so
# the runtime's `__dirname/migrations/001_init.sql` lookup would otherwise miss).
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
 && mkdir -p dist/db/migrations \
 && cp src/db/migrations/*.sql dist/db/migrations/

# ── Stage 2: runtime (production deps only) ────────────────────────────────
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only production dependencies → smaller image, no toolchain.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled app + the migration SQL copied above.
COPY --from=builder /app/dist ./dist

# The on-device embedding model downloads here on first use; a mounted volume
# can persist it across restarts (otherwise it re-downloads ~30MB).
ENV TRANSFORMERS_CACHE=/app/.cache
RUN mkdir -p /app/.cache

# Server port (overridable via PORT env).
EXPOSE 4000

# Basic container healthcheck against the /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
