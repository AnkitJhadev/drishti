# Drishti on Kubernetes + Kafka (local demo)

A fully self-contained, **horizontally scalable** deployment of Drishti on Kubernetes with a real Kafka event log — runs entirely on your own machine via [`kind`](https://kind.sigs.k8s.io/), costs nothing, and has **no dependency on the live EC2/Vercel deployment or its credentials**. Every stateful service (Postgres, Qdrant, Redis, Kafka) runs in-cluster.

This exists alongside, not instead of, the [EC2 + Vercel deployment](../DEPLOY.md) — that one stays untouched. This is a separate architecture variant demonstrating the same app split across independently-scalable Kubernetes Deployments, with a Kafka-based event log for audit/replay sitting next to the primary BullMQ job pipeline. See the main [README's System Design section](../README.md#system-design) for the full HLD/LLD of both variants side by side.

## Quick start

```bash
cd k8s
cp secret.example.yaml secret.yaml   # then fill in GROQ_API_KEY + JWT_SECRET
./setup.sh
```

`setup.sh` does everything: checks prerequisites, creates the `kind` cluster, builds + loads the backend image, installs `metrics-server` (needed for autoscaling), applies every manifest, and waits for all pods to be `Ready`. It's idempotent — safe to re-run after a code change (it'll rebuild/reload the image and re-apply).

If you'd rather run each step yourself (or want to see what's actually happening), the manual steps are below in [Manual step-by-step](#manual-step-by-step).

## What's different from the EC2 deployment

| | EC2 (`DEPLOY.md`) | This (`k8s/`) |
|---|---|---|
| Orchestration | `docker compose`, one host | Kubernetes — `kind` locally; a single-node `k3s` is the free-forever path for a real deployment (see bottom) |
| API + worker | one process, one container | **two separate Deployments** (`backend-api`, `backend-worker`) — `PROCESS_ROLE=api\|worker` controls which one runs |
| Scaling | manual, single instance | `backend-api`: **HorizontalPodAutoscaler**, 1→4 replicas on CPU. `backend-worker`: 2 replicas by default, scale further with one command — see [Scaling](#scaling) |
| Postgres / Qdrant | managed (Neon / Qdrant Cloud) | in-cluster (`pgvector/pgvector`, `qdrant/qdrant`) |
| Redis | self-hosted container | self-hosted, in-cluster |
| Event log | none | **Kafka** (KRaft mode, single broker, 3-partition topics) — `drishti.complaints` / `drishti.recommendations`, published to by [`backend/src/events/kafkaProducer.ts`](../backend/src/events/kafkaProducer.ts) alongside the existing DB writes. Optional and best-effort: with `KAFKA_BROKERS` unset, every publish is a silent no-op — this never affects the EC2 deployment. |

## Scaling

This is built to actually scale, not just look like it does — every claim below was run and verified, not assumed.

**`backend-api` — automatic (HPA).** [`hpa.yaml`](hpa.yaml) scales it 1→4 replicas on 70% CPU utilization. Verify it's live:
```bash
kubectl get hpa -n drishti
# NAME          REFERENCE                TARGETS       MINPODS   MAXPODS   REPLICAS
# backend-api   Deployment/backend-api   cpu: 9%/70%   1         4         2
```
It starts at 2 replicas so the Service is already load-balancing across pods before any scaling event happens.

**`backend-worker` — manual, and verified safe to run in parallel.** Defaults to 2 replicas:
```bash
kubectl scale deployment/backend-worker -n drishti --replicas=4
```
This is safe because BullMQ's rate limiter (the thing keeping classification under Groq's free-tier ≤4/min cap) is a **Redis-backed token bucket keyed by queue name** — not a per-process counter (confirmed by reading `backend/node_modules/bullmq/dist/cjs/classes/worker.js`: every worker instance reads/writes the same Redis key). Tested directly: scaled to 2 replicas, submitted 3 complaints, and the two pods' logs showed the jobs split cleanly across both — no duplicate processing, no rate-limit violation. It's not an autoscaler because the real bottleneck is Groq's external quota, not CPU — adding more replicas doesn't move that bottleneck past a point, it just gives you more parallelism *within* the existing quota.

**Kafka — partitioned for consumer parallelism.** [`kafka-topics-init.yaml`](kafka-topics-init.yaml) pre-creates both topics with **3 partitions** each, instead of relying on Kafka's auto-create (which defaults to 1 partition — meaning only one consumer in a group can ever do anything, no matter how many you add). With 3 partitions, up to 3 consumer instances in the same group genuinely parallelize. The broker itself is single-node for this local demo — replication (fault tolerance, as opposed to throughput) would need 3 brokers, which is a real resource jump (see the note at the bottom on where to run that for free).

## Manual step-by-step

(What `setup.sh` automates — useful if something goes wrong and you want to isolate which step.)

### 1. Create the cluster
```bash
kind create cluster --name drishti
kubectl get storageclass   # confirms the default StorageClass kind ships with (needed for Postgres/Qdrant PVCs)
```

### 2. Build the backend image and load it into the cluster
`kind` clusters don't pull from your local Docker automatically:
```bash
cd backend && docker build -t drishti-backend:local .
kind load docker-image drishti-backend:local --name drishti
```
Re-run both after any backend code change.

### 3. Configure secrets
```bash
cd k8s && cp secret.example.yaml secret.yaml   # gitignored — never commit this
```
Fill in `GROQ_API_KEY` (free: [console.groq.com](https://console.groq.com)) and `JWT_SECRET` (`openssl rand -base64 48`). Everything else already points at the in-cluster services defined here.

### 4. Install metrics-server (needed for the HPA)
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```
The patch is required on `kind` specifically — its kubelet certs aren't signed by a CA metrics-server trusts by default; without it, `kubectl top` and the HPA both silently show no data.

### 5. Deploy everything
```bash
kubectl apply -k .
kubectl get pods -n drishti -w
```
`backend-api`/`backend-worker` each carry an init container that blocks on Postgres/Qdrant/Redis being reachable first — avoids a few pointless crash-loop cycles, since the app hard-fails startup if those aren't up yet.

### 6. Verify end-to-end
```bash
kubectl port-forward -n drishti svc/backend-api 4000:4000 &
curl http://localhost:4000/health
```
Log in and ingest a test complaint:
```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@drishti.com","password":"drishti@123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

curl -s -X POST http://localhost:4000/ingest/records \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"records":[{"source":"csv","text":"No network signal at all since morning, no service in Whitefield.","location":"Whitefield Bengaluru"}]}'
```
Confirm the worker classified it, and check which pod handled it (useful once you've scaled worker replicas):
```bash
kubectl logs -n drishti -l app=backend-worker --tail=20 --prefix | grep classified
```
Confirm the Kafka event landed:
```bash
kubectl exec -n drishti deploy/kafka -- /opt/kafka/bin/kafka-console-consumer.sh \
  --topic drishti.complaints --from-beginning --bootstrap-server kafka:9092 \
  --max-messages 1 --timeout-ms 15000
```

## Troubleshooting notes (found while building this)

- **`backend-api`/`backend-worker` crash-loop with `"The server does not support SSL connections"`** — the raw `pg.Pool` used only for running migrations ([`backend/src/db/postgres.ts`](../backend/src/db/postgres.ts)) used to force TLS for any hostname other than literally `localhost`/`127.0.0.1`. A Kubernetes Service name like `postgres` tripped that heuristic. Fixed: an explicit `?sslmode=disable` in `DATABASE_URL` now always wins over the hostname guess — already set correctly in `secret.example.yaml`.
- **Kafka consumer groups hang forever, `Processed a total of 0 messages`** — Kafka's internal `__consumer_offsets` topic defaults to replication-factor 3, which can never be satisfied with 1 broker; topic creation silently retries forever and no consumer group can ever fully join. Fixed in [`kafka.yaml`](kafka.yaml) via `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1` (and the transaction-log equivalent). Not optional on a single-broker setup.
- **Kafka client inside the same container can't reach its own advertised listener** — if `KAFKA_ADVERTISED_LISTENERS` is set to `localhost:<hostPort>` (e.g. for a quick `docker run` sanity check), clients get metadata pointing at a `localhost` port that isn't open *inside* that same container's network namespace. Use a real hostname consistently everywhere (here: the k8s Service name `kafka`) — never `localhost` — including in `KAFKA_CONTROLLER_QUORUM_VOTERS`.
- **A topic shows `PartitionCount: 1` even though `kafka-topics-init.yaml` asks for 3** — `--create --if-not-exists` is a no-op if the topic already exists, regardless of the partition count you asked for (e.g. if the app auto-created it earlier via a test request, before the init Job ever ran). Fix on an existing topic: `kafka-topics.sh --alter --topic <name> --partitions 3 --bootstrap-server kafka:9092` (partition counts can only go up, never down). On a fresh cluster built via `setup.sh` this doesn't happen — the init Job runs before anything can auto-create the topic.
- **`kubectl top` / the HPA show no metrics** — see step 4 above; the `--kubelet-insecure-tls` patch is required on `kind`, unlike a real cluster with properly-signed kubelet certs.

## Tearing down
```bash
kind delete cluster --name drishti
```

## If you want this actually running on the internet, not just locally

`kind` is local-only by design. For a real deployment of this same manifest set that's free *forever* (not a 12-month trial):

1. An **Oracle Cloud "Always Free" Ampere A1 VM** (up to 4 ARM cores / 24GB RAM, free forever — verified on Oracle's own pricing page, no time limit unlike AWS's free tier).
2. Install **`k3s`** on it (single-node, real CNCF-certified Kubernetes, ~$0 overhead).
3. Apply these same manifests (swap `kind load docker-image` for pushing to a registry `k3s` can pull from, e.g. GitHub Container Registry's free tier).
4. With 24GB available, a genuine 3-broker Kafka cluster (real replication, not just partitioning) becomes realistic too — this demo intentionally stays single-broker to fit comfortably anywhere, including a modest laptop.
