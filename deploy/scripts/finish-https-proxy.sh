#!/usr/bin/env bash
set -euo pipefail

CONF=/etc/nginx/sites-enabled/can-rides.conf

python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-enabled/can-rides.conf')
text = p.read_text()
api_loc = '''
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
        client_max_body_size 50m;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
'''
changed = False
for marker in [
    'ssl_certificate_key /etc/letsencrypt/live/www.can-rides.ca/privkey.pem; # managed by Certbot',
    'ssl_certificate_key /etc/letsencrypt/live/admin.can-rides.ca/privkey.pem; # managed by Certbot',
]:
    if marker in text and text.split(marker, 1)[1][:200].find('location /api/') < 0:
        # only insert if /api/ not already near this marker
        idx = text.find(marker)
        after = text[idx:idx+400]
        if 'location /api/' not in after:
            text = text.replace(marker, marker + '\n' + api_loc, 1)
            changed = True
            print('inserted_after', marker.split('/')[4])
if changed:
    p.write_text(text)
    print('NGINX_UPDATED')
else:
    print('NGINX_UNCHANGED')
PY

nginx -t
systemctl reload nginx

echo 'NEXT_PUBLIC_CANGO_API_BASE=https://www.can-rides.ca/api' > /opt/cango/apps/web-passenger/.env.production.local
echo 'NEXT_PUBLIC_CANGO_API_BASE=https://admin.can-rides.ca/api' > /opt/cango/apps/admin/.env.production.local

sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=https://can-rides.ca,https://www.can-rides.ca,https://admin.can-rides.ca,http://can-rides.ca,http://www.can-rides.ca,http://admin.can-rides.ca,http://api.can-rides.ca|' /opt/cango/backend/.env
sed -i 's|^PASSENGER_WEB_BASE=.*|PASSENGER_WEB_BASE=https://www.can-rides.ca|' /opt/cango/backend/.env
sed -i 's|^ADMIN_WEB_BASE=.*|ADMIN_WEB_BASE=https://admin.can-rides.ca|' /opt/cango/backend/.env

cd /opt/cango/apps/web-passenger
rm -rf .next
NODE_OPTIONS='--max-old-space-size=4096' npm run build

cd /opt/cango/apps/admin
rm -rf .next
NODE_OPTIONS='--max-old-space-size=4096' npm run build

pm2 restart all
sleep 4
curl -fsS https://www.can-rides.ca/api/health
echo
curl -fsS https://admin.can-rides.ca/api/health
echo
curl -fsS -o /dev/null -w 'www=%{http_code}\n' https://www.can-rides.ca/
curl -fsS -o /dev/null -w 'admin=%{http_code}\n' https://admin.can-rides.ca/
