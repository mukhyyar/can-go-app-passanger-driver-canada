#!/usr/bin/env bash
set -euo pipefail
date -u
echo "Waiting until after 01:18 UTC for Let's Encrypt rate limit..."
while true; do
  now=$(date -u +%H%M)
  if [ "$now" -ge 0118 ]; then
    break
  fi
  sleep 15
done
date -u

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  echo "ATTEMPT ${i}"
  if certbot certonly --webroot -w /var/www/certbot \
      --non-interactive --agree-tos --register-unsafely-without-email \
      -d can-rides.ca --cert-name can-rides-apex; then
    ok=1
    echo "GOT_APEX_CERT"
    break
  fi
  sleep 40
done

if [ "$ok" -ne 1 ]; then
  echo "APEX_CERT_FAILED — try DNS challenge next"
  certbot certificates
  exit 2
fi

# Also try api
certbot certonly --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --register-unsafely-without-email \
  -d api.can-rides.ca --cert-name api.can-rides.ca || true

# Append apex HTTPS server with real cert
if ! grep -q 'server_name can-rides.ca;' /etc/nginx/sites-available/can-rides.conf | head -1; then
  true
fi

# Add / replace apex 443 block
python3 <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/can-rides.conf')
text = p.read_text()
block = '''
# HTTPS apex — real Let's Encrypt cert (can-rides-apex)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name can-rides.ca;
    ssl_certificate /etc/letsencrypt/live/can-rides-apex/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/can-rides-apex/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
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
    location /socket.io/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
    location / {
        proxy_pass http://cango_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
'''
if 'can-rides-apex/fullchain.pem' not in text:
    p.write_text(text.rstrip() + '\n' + block)
    print('APEX_HTTPS_BLOCK_ADDED')
else:
    print('APEX_HTTPS_BLOCK_EXISTS')
PY

# If api cert exists, add block
if [ -f /etc/letsencrypt/live/api.can-rides.ca/fullchain.pem ]; then
python3 <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/can-rides.conf')
text = p.read_text()
block = '''
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.can-rides.ca;
    ssl_certificate /etc/letsencrypt/live/api.can-rides.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.can-rides.ca/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;
    location /socket.io/ {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
    location / {
        proxy_pass http://cango_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 86400;
    }
}
'''
if 'live/api.can-rides.ca/fullchain.pem' not in text or 'server_name api.can-rides.ca;' not in text.split('443 ssl')[-1]:
    if 'ssl_certificate /etc/letsencrypt/live/api.can-rides.ca/fullchain.pem' not in text:
        p.write_text(text.rstrip() + '\n' + block)
        print('API_HTTPS_BLOCK_ADDED')
PY
fi

nginx -t
systemctl reload nginx

echo "==> Verify certificates"
echo | openssl s_client -servername can-rides.ca -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
curl -fsS -o /dev/null -w 'https_apex=%{http_code}\n' https://can-rides.ca/
curl -fsS -o /dev/null -w 'https_www=%{http_code}\n' https://www.can-rides.ca/
curl -fsS https://can-rides.ca/api/health
echo
echo DONE
