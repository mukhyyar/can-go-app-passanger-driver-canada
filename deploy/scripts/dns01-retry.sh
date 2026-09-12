#!/usr/bin/env bash
set -euo pipefail

pkill -f 'certbot certonly' 2>/dev/null || true
sleep 1

cat > /tmp/acme-auth-hook.sh <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
{
  echo "DOMAIN=$CERTBOT_DOMAIN"
  echo "VALUE=$CERTBOT_VALIDATION"
  echo "UPDATED_AT=$(date -u -Iseconds)"
} > /tmp/acme-dns-challenge.txt
echo "============================================================"
echo "cPanel Zone Editor → can-rides.ca → TXT"
echo "Name : _acme-challenge"
echo "Value: $CERTBOT_VALIDATION"
echo "DELETE any other _acme-challenge TXT records"
echo "============================================================"
# Prefer authoritative NS, then public resolvers
for i in $(seq 1 60); do
  g1=$(dig +short TXT "_acme-challenge.$CERTBOT_DOMAIN" @ns1.mzcorp.com 2>/dev/null | tr -d '"' || true)
  g2=$(dig +short TXT "_acme-challenge.$CERTBOT_DOMAIN" @8.8.8.8 2>/dev/null | tr -d '"' || true)
  g3=$(dig +short TXT "_acme-challenge.$CERTBOT_DOMAIN" @1.1.1.1 2>/dev/null | tr -d '"' || true)
  echo "wait $i auth=[$g1] g8=[$g2] cf=[$g3]"
  if echo "$g1$g2$g3" | grep -Fq "$CERTBOT_VALIDATION"; then
    # extra settle time for LE multi-perspective
    echo "TXT seen — waiting 60s for global propagation"
    sleep 60
    exit 0
  fi
  sleep 10
done
exit 1
HOOK
chmod +x /tmp/acme-auth-hook.sh
echo '#!/bin/true' > /tmp/acme-cleanup-hook.sh
chmod +x /tmp/acme-cleanup-hook.sh

echo "Starting certbot DNS-01..."
nohup certbot certonly --manual --preferred-challenges dns \
  --manual-auth-hook /tmp/acme-auth-hook.sh \
  --manual-cleanup-hook /tmp/acme-cleanup-hook.sh \
  --non-interactive --agree-tos --register-unsafely-without-email \
  -d can-rides.ca \
  --cert-name can-rides-apex \
  > /tmp/dns01-retry.log 2>&1 &
echo "PID $!"
sleep 8
cat /tmp/acme-dns-challenge.txt
