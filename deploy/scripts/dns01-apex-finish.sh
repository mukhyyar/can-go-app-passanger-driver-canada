#!/usr/bin/env bash
set -euo pipefail

pkill -f 'certbot certonly' 2>/dev/null || true
pkill -f 'acme-auth-hook' 2>/dev/null || true
sleep 2

cat > /tmp/acme-auth-hook.sh <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
{
  echo "DOMAIN=$CERTBOT_DOMAIN"
  echo "NAME=_acme-challenge"
  echo "FQDN=_acme-challenge.$CERTBOT_DOMAIN"
  echo "VALUE=$CERTBOT_VALIDATION"
  echo "UPDATED_AT=$(date -u -Iseconds)"
} > /tmp/acme-dns-challenge.txt
echo "Need TXT _acme-challenge = $CERTBOT_VALIDATION"
for i in $(seq 1 40); do
  got=$(dig +short TXT "_acme-challenge.$CERTBOT_DOMAIN" @8.8.8.8 2>/dev/null | tr -d '"' || true)
  echo "wait $i: $got"
  if echo "$got" | grep -Fq "$CERTBOT_VALIDATION"; then
    echo "DNS TXT OK"
    sleep 5
    exit 0
  fi
  sleep 10
done
echo "TXT not found in time"
exit 1
HOOK
chmod +x /tmp/acme-auth-hook.sh
echo '#!/bin/true' > /tmp/acme-cleanup-hook.sh
chmod +x /tmp/acme-cleanup-hook.sh

echo "Current public TXT:"
dig +short TXT _acme-challenge.can-rides.ca @8.8.8.8 || true

# If a NEW challenge value is needed, user must update TXT again.
# Print new value immediately via a dry pre-check isn't possible without starting certbot.
certbot certonly --manual --preferred-challenges dns \
  --manual-auth-hook /tmp/acme-auth-hook.sh \
  --manual-cleanup-hook /tmp/acme-cleanup-hook.sh \
  --non-interactive --agree-tos --register-unsafely-without-email \
  -d can-rides.ca \
  --cert-name can-rides-apex

echo CERT_OK
ls -la /etc/letsencrypt/live/can-rides-apex/

python3 <<'PY'
from pathlib import Path
import re
p = Path('/etc/nginx/sites-available/can-rides.conf')
text = p.read_text()
text = re.sub(
    r'\n# Reject HTTPS on apex until real LE cert exists[\s\S]*?ssl_reject_handshake on;\n\}\n?',
    '\n',
    text,
)
# Also remove any prior incomplete apex 443 reject-only blocks
text = re.sub(
    r'\nserver \{\n    listen 443 ssl;\n    listen \[::\]:443 ssl;\n    server_name can-rides\.ca;\n    ssl_reject_handshake on;\n\}\n?',
    '\n',
    text,
)
block = '''
# HTTPS apex — Let's Encrypt (DNS-01)
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
    p.write_text(text.rstrip() + '\n' + block + '\n')
else:
    p.write_text(text)
print('NGINX_WIRED')
PY

nginx -t
systemctl reload nginx
echo | openssl s_client -servername can-rides.ca -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName || true
curl -fsS -o /dev/null -w 'https_apex=%{http_code}\n' https://can-rides.ca/
curl -fsS -o /dev/null -w 'https_www=%{http_code}\n' https://www.can-rides.ca/
curl -fsS https://can-rides.ca/api/health || true
echo
echo DONE
