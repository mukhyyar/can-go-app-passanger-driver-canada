#!/usr/bin/env bash
# One-time Droplet bootstrap for Can Rides (can-rides.ca).
# Usage: bash bootstrap.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/cango}"
REPO_URL="${REPO_URL:-https://github.com/mukhyyar/can-go-app-passanger-driver-canada.git}"
BRANCH="${DEPLOY_BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive

echo "==> System packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw nginx certbot python3-certbot-nginx build-essential

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> App directory"
mkdir -p "$APP_ROOT" /var/www/certbot /var/log/cango /etc/cango
if [[ ! -d "$APP_ROOT/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_ROOT"
else
  cd "$APP_ROOT"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

chmod +x "$APP_ROOT/deploy/scripts/"*.sh

echo "==> Nginx site"
cp "$APP_ROOT/deploy/nginx/can-rides.conf" /etc/nginx/sites-available/can-rides.conf
ln -sfn /etc/nginx/sites-available/can-rides.conf /etc/nginx/sites-enabled/can-rides.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Bootstrap base done. Next: write env files, run deploy.sh, then certbot."
