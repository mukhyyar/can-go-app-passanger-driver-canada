#!/usr/bin/env bash
set -euo pipefail

python3 <<'PY'
from pathlib import Path
import re

p = Path('/etc/nginx/sites-available/can-rides.conf')
text = p.read_text()

new = '''
# HTTPS apex — cert covers can-rides.ca + www; redirect to canonical www
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name can-rides.ca;
    ssl_certificate /etc/letsencrypt/live/www.can-rides.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.can-rides.ca/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://www.can-rides.ca$request_uri;
}
'''

pat = re.compile(
    r'\n?# Reject HTTPS on apex.*?\nserver \{\n    listen 443 ssl;\n    listen \[::\]:443 ssl;\n    server_name can-rides\.ca;\n    ssl_reject_handshake on;\n\}\n?',
    re.S,
)

if not pat.search(text):
    raise SystemExit('reject block not found')

p.write_text(pat.sub('\n' + new.strip() + '\n', text, count=1))
print('APEX_HTTPS_WIRED')
PY

nginx -t
systemctl reload nginx

echo '=== verify ==='
echo | openssl s_client -servername can-rides.ca -connect 127.0.0.1:443 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
curl -fsS -o /dev/null -w 'https_apex=%{http_code} redirect=%{redirect_url}\n' https://can-rides.ca/
curl -fsS -o /dev/null -w 'https_www=%{http_code}\n' https://www.can-rides.ca/
