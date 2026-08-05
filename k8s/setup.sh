#!/usr/bin/env bash
# One-command bootstrap for the local k8s+Kafka demo — every step here is the
# exact sequence that was manually run and verified working while building
# this (see README.md's "Troubleshooting notes" for the gotchas that led to
# some of these steps existing at all).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

CLUSTER=drishti
NS=drishti

echo "── 1/7  Checking prerequisites ──────────────────────────────"
for cmd in docker kind kubectl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "✗ '$cmd' not found. Install it first (e.g. 'brew install $cmd') and re-run."
    exit 1
  fi
done
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker daemon isn't running. Start Docker Desktop and re-run."
  exit 1
fi
echo "✓ docker, kind, kubectl present; Docker daemon is up"

echo "── 2/7  Secrets ──────────────────────────────────────────────"
if [ ! -f secret.yaml ]; then
  cp secret.example.yaml secret.yaml
  echo "✗ Created k8s/secret.yaml from the template — it needs real values."
  echo "  Edit it now: set GROQ_API_KEY (free: https://console.groq.com)"
  echo "  and JWT_SECRET (generate: openssl rand -base64 48), then re-run this script."
  exit 1
fi
if grep -q "REPLACE_WITH" secret.yaml; then
  echo "✗ k8s/secret.yaml still has placeholder values (REPLACE_WITH...) — fill them in and re-run."
  exit 1
fi
echo "✓ secret.yaml is filled in"

echo "── 3/7  Kind cluster ─────────────────────────────────────────"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "✓ cluster '$CLUSTER' already exists"
else
  kind create cluster --name "$CLUSTER"
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

echo "── 4/7  Build + load the backend image ───────────────────────"
docker build -t drishti-backend:local ../backend
kind load docker-image drishti-backend:local --name "$CLUSTER"

echo "── 5/7  metrics-server (needed for the HPA) ───────────────────"
if kubectl get deployment metrics-server -n kube-system >/dev/null 2>&1; then
  echo "✓ metrics-server already installed"
else
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  # kind's kubelet certs aren't signed by a CA metrics-server trusts by default.
  kubectl patch deployment metrics-server -n kube-system --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
fi

echo "── 6/7  Apply manifests ──────────────────────────────────────"
kubectl apply -k .

echo "── 7/7  Waiting for pods to be ready (this can take ~1-2 min the first time) ──"
# Deployments only — NOT "pods --all". kafka-topics-init is a one-shot Job;
# its pod exits 0/1 Completed once done and can never satisfy a Ready
# condition, so waiting on "all pods" here would hang until the timeout even
# when everything is actually healthy.
for d in postgres qdrant redis kafka backend-api backend-worker; do
  kubectl rollout status "deployment/$d" -n "$NS" --timeout=180s || {
    echo "✗ deployment/$d did not become ready in time. Check: kubectl get pods -n $NS"
    exit 1
  }
done
kubectl wait --for=condition=complete job/kafka-topics-init -n "$NS" --timeout=60s || {
  echo "✗ kafka-topics-init Job did not complete. Check: kubectl logs -n $NS job/kafka-topics-init"
  exit 1
}

echo ""
echo "✓ Everything is up. Pods:"
kubectl get pods -n "$NS"
echo ""
echo "Next steps:"
echo "  kubectl port-forward -n $NS svc/backend-api 4000:4000 &"
echo "  curl http://localhost:4000/health"
echo ""
echo "Login: admin@drishti.com / drishti@123"
echo "Tear down: kind delete cluster --name $CLUSTER"
