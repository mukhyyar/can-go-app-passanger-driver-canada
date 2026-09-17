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
if [[ -f .env ]]; then
  sed -i 's|^GOOGLE_OAUTH_CLIENT_ID=.*|GOOGLE_OAUTH_CLIENT_ID=400688849973-d3h2obnaoghc3ags7gsuo5j4a81drhr1.apps.googleusercontent.com|' .env || true
fi
if [[ -d node_modules ]]; then
  chmod -R u+w node_modules || true
  rm -rf node_modules || mv node_modules "node_modules.trash.$$"
  rm -rf node_modules.trash.* || true
fi
npm ci
npx prisma generate
npx prisma migrate deploy || true
# Schema is ahead of checked-in migrations; keep DB in sync until migrations catch up.
npx prisma db push
npm run build
npm prune --omit=dev || true

echo "==> Admin"
cd "$APP_ROOT/apps/admin"
rm -rf node_modules .next || true
npm ci
npm run build

echo "==> Web passenger"
cd "$APP_ROOT/apps/web-passenger"
rm -rf node_modules .next || true
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
