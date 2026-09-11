#!/usr/bin/env bash
# Obtain proper SSL for apex + www + api + admin and rewrite nginx.
set -euo pipefail

mkdir -p /var/www/certbot
systemctl reload nginx || true

echo "==> Requesting certificates (nginx authenticator)"
# One cert for site (apex + www) — fixes Bitdefender mismatch on can-rides.ca
certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email \
  --cert-name can-rides.ca \
  -d can-rides.ca -d www.can-rides.ca \
  --keep-until-expiring || \
certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email \
  --cert-name can-rides.ca \
  -d can-rides.ca -d www.can-rides.ca \
  --force-renewal

# API
certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email \
  --cert-name api.can-rides.ca \
  -d api.can-rides.ca \
  --keep-until-expiring || true

# Admin already exists; ensure present
certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email \
  --cert-name admin.can-rides.ca \
  -d admin.can-rides.ca \
  --keep-until-expiring || true

ls -la /etc/letsencrypt/live/

SITE_CERT=can-rides.ca
if [[ ! -f /etc/letsencrypt/live/can-rides.ca/fullchain.pem ]]; then
  SITE_CERT=www.can-rides.ca
fi

API_CERT=
if [[ -f /etc/letsencrypt/live/api.can-rides.ca/fullchain.pem ]]; then
  API_CERT=api.can-rides.ca
fi

echo "SITE_CERT=$SITE_CERT API_CERT=${API_CERT:-none}"

cat > /etc/nginx/sites-available/can-rides.conf <<EOF
upstream cango_api {
    server 127.0.0.1:4000;
    keepalive 32;
}
upstream cango_admin {
    server 127.0.0.1:3001;
    keepalive 16;
}
upstream cango_web {
    server 127.0.0.1:3002;
    keepalive 16;
}
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

# --- HTTP: ACME + redirect to HTTPS ---
server {
    listen 80;
    listen [::]:80;
    server_name can-rides.ca www.can-rides.ca;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 80;
    listen [::]:80;
    server_name admin.can-rides.ca;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 80;
    listen [::]:80;
    server_name api.can-rides.ca;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / {
EOF

if [[ -n "$API_CERT" ]]; then
  cat >> /etc/nginx/sites-available/can-rides.conf <<'EOF'
        return 301 https://$host$request_uri;
    }
}
EOF
else
  cat >> /etc/nginx/sites-available/can-rides.conf <<'EOF'
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 86400;
        client_max_body_size 50m;
    }
}
EOF
fi

cat >> /etc/nginx/sites-available/can-rides.conf <<EOF

# --- HTTPS: web (apex + www) ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name can-rides.ca www.can-rides.ca;

    ssl_certificate /etc/letsencrypt/live/${SITE_CERT}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SITE_CERT}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_read_timeout 86400;
        client_max_body_size 50m;
    }
    location /socket.io/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
    location / {
        proxy_pass http://cango_web;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
    }
}

# --- HTTPS: admin ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name admin.can-rides.ca;

    ssl_certificate /etc/letsencrypt/live/admin.can-rides.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.can-rides.ca/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_read_timeout 86400;
        client_max_body_size 50m;
    }
    location /socket.io/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
    location / {
        proxy_pass http://cango_admin;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
    }
}
EOF

if [[ -n "$API_CERT" ]]; then
  cat >> /etc/nginx/sites-available/can-rides.conf <<EOF

# --- HTTPS: api ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.can-rides.ca;

    ssl_certificate /etc/letsencrypt/live/${API_CERT}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${API_CERT}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;

    location /socket.io/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
    location / {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF
fi

ln -sfn /etc/nginx/sites-available/can-rides.conf /etc/nginx/sites-enabled/can-rides.conf
nginx -t
systemctl reload nginx

echo "==> Verify"
echo | openssl s_client -servername can-rides.ca -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName || true
curl -fsS -o /dev/null -w 'https_apex=%{http_code}\n' https://can-rides.ca/
curl -fsS -o /dev/null -w 'https_www=%{http_code}\n' https://www.can-rides.ca/
curl -fsS -o /dev/null -w 'https_admin=%{http_code}\n' https://admin.can-rides.ca/
curl -fsS https://can-rides.ca/api/health || true
echo
if [[ -n "$API_CERT" ]]; then
  curl -fsS https://api.can-rides.ca/api/health || true
  echo
fi
echo DONE
