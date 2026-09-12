#!/usr/bin/env bash
set -euo pipefail

# Install acme.sh if needed
if [ ! -f /root/.acme.sh/acme.sh ]; then
  curl -fsSL https://get.acme.sh | sh -s email=ssl@can-rides.ca
fi

export PATH="/root/.acme.sh:$PATH"

# Use existing TXT if it matches a challenge we control via dns manual mode.
# acme.sh dns manual: issue, print TXT, wait for Enter — we automate with --yes-I-know...

echo "Trying ZeroSSL DNS-01 for can-rides.ca..."
/root/.acme.sh/acme.sh --set-default-ca --server zerossl || true
/root/.acme.sh/acme.sh --register-account -m ssl@can-rides.ca || true

# Force new order; use dns manual mode with pre-set wait via --dnssleep
# First run will fail without TXT; we use --renew-hook style:
# Better: use --dns with manual and --yes-I-know-dns-manual-mode-enough-go-ahead
# which prints values then waits dnssleep seconds.

rm -rf /root/.acme.sh/can-rides.ca_ecc /root/.acme.sh/can-rides.ca 2>/dev/null || true

set +e
/root/.acme.sh/acme.sh --issue -d can-rides.ca --dns \
  --yes-I-know-dns-manual-mode-enough-go-ahead \
  --dnssleep 120 \
  --server zerossl 2>&1 | tee /tmp/zerossl-dns.log
rc=${PIPESTATUS[0]}
set -e

# Extract TXT from log if still needed
grep -E 'TXT| Domains:|_acme-challenge' /tmp/zerossl-dns.log | head -n 40 || true

if [ "$rc" -eq 0 ] || [ -f /root/.acme.sh/can-rides.ca_ecc/fullchain.cer ] || [ -f /root/.acme.sh/can-rides.ca/fullchain.cer ]; then
  CERT_DIR=/root/.acme.sh/can-rides.ca_ecc
  [ -f "$CERT_DIR/fullchain.cer" ] || CERT_DIR=/root/.acme.sh/can-rides.ca
  mkdir -p /etc/letsencrypt/live/can-rides-apex
  /root/.acme.sh/acme.sh --install-cert -d can-rides.ca \
    --fullchain-file /etc/letsencrypt/live/can-rides-apex/fullchain.pem \
    --key-file /etc/letsencrypt/live/can-rides-apex/privkey.pem \
    --reloadcmd "systemctl reload nginx"
  echo ZEROSSL_OK
  exit 0
fi

echo ZEROSSL_FAILED
# Also try Let's Encrypt via acme.sh once
set +e
/root/.acme.sh/acme.sh --issue -d can-rides.ca --dns \
  --yes-I-know-dns-manual-mode-enough-go-ahead \
  --dnssleep 90 \
  --server letsencrypt --force 2>&1 | tee /tmp/le-dns-acme.log
rc2=${PIPESTATUS[0]}
set -e
grep -E 'TXT value|Domain:|Add the following' /tmp/le-dns-acme.log | head -n 30 || true
if [ "$rc2" -eq 0 ]; then
  echo LE_ACME_OK
  exit 0
fi
exit 1
