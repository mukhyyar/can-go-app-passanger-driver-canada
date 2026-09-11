#!/usr/bin/env bash
# Pull latest main, rebuild apps, reload PM2.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cango}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_ROOT"

echo "==> Fetching $BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Infra (Postgres / Redis / MinIO)"
if [[ -f deploy/.env.infra ]]; then
  set -a
  # shellcheck disable=SC1091
  source deploy/.env.infra
  set +a
fi
docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps

echo "==> Waiting for Postgres"
for i in $(seq 1 60); do
  if docker exec cango-postgres pg_isready -U cango -d cango >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Backend"
cd "$APP_ROOT/backend"
rm -rf node_modules
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm prune --omit=dev

echo "==> Admin"
cd "$APP_ROOT/apps/admin"
rm -rf node_modules .next
npm ci
npm run build

echo "==> Web passenger"
cd "$APP_ROOT/apps/web-passenger"
rm -rf node_modules .next
npm ci
npm run build

echo "==> PM2 reload"
cd "$APP_ROOT"
mkdir -p /var/log/cango
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "==> Deploy OK"
pm2 status
curl -fsS -o /dev/null -w "api_health=%{http_code}\n" http://127.0.0.1:4000/api/health || true
