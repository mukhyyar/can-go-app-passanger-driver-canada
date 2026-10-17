# cPanel HTTP mail relay (for DigitalOcean)

DigitalOcean blocks outbound SMTP. NestJS on the droplet calls this PHP script over **HTTPS**; PHP sends mail via **localhost SMTP** on cPanel (`162.55.232.49`).

## Decided location

| Item | Value |
|------|--------|
| Subdomain | `notify.can-rides.ca` |
| Public URL | `https://notify.can-rides.ca/cango-mail-relay.php` |
| Why | Apex/`www`/`api`/`admin` point at DigitalOcean. `mail.*` is cPanel-reserved for mail services — use a dedicated subdomain on the **cPanel IP** (`162.55.232.49`). |
| Upload folder | `/home/canrides/public_html/notify/` (cPanel subdomain document root) |

## What you add in cPanel

1. **Domains → Create A New Domain / Subdomain**
   - Domain: `notify.can-rides.ca`
   - Document Root: `public_html/notify` (default is fine)
2. **Zone Editor** (if A record was not auto-created):  
   `notify.can-rides.ca` → **A** → `162.55.232.49`  
   (Must be cPanel IP, **not** the DigitalOcean droplet.)
3. **SSL**: wait for AutoSSL / issue cert for `notify.can-rides.ca` (HTTPS required).
4. **File Manager** → `public_html/notify/` → upload:
   - `cango-mail-relay.php`
   - `cango-mail-relay.config.php` (from the `.example`, fill secrets)
5. Permissions: files `644`, not world-writable.
6. Harden: `allow_ips` → `['165.227.45.3']` only (after testing).

## Config values to fill

```php
'relay_key' => '<same as EMAIL_RELAY_KEY on droplet>',
'smtp_user' => 'no-reply@can-rides.ca',
'smtp_pass' => '<mailbox password>',
'from'      => 'Can Ride <no-reply@can-rides.ca>',
'allow_ips' => ['165.227.45.3'],
```

If `localhost:465` fails on your host, try `'smtp_host' => 'mail.can-rides.ca'` (still on the same machine).

## Quick test (from your PC)

```bash
curl -sS -X POST "https://notify.can-rides.ca/cango-mail-relay.php" \
  -H "Content-Type: application/json" \
  -H "X-Mail-Relay-Key: YOUR_RELAY_KEY" \
  -d "{\"to\":\"you@example.com\",\"subject\":\"Relay test\",\"html\":\"<p>ok</p>\",\"text\":\"ok\"}"
```

Expect: `{"ok":true,"id":"..."}`.  
If you get `IP not allowed`, temporarily empty `allow_ips` for the PC test, then restore droplet IP only.

## NestJS (droplet) env

```
EMAIL_ENABLED=true
EMAIL_RELAY_URL=https://notify.can-rides.ca/cango-mail-relay.php
EMAIL_RELAY_KEY=<same relay_key>
SMTP_FROM=Can Ride <no-reply@can-rides.ca>
```

Priority in app: **relay → Resend → SMTP**.
