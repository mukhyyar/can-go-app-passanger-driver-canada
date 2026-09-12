# Production deploy (DigitalOcean)

## Live URLs

| URL | App |
|-----|-----|
| https://www.can-rides.ca | Passenger web |
| https://admin.can-rides.ca | Admin |
| https://www.can-rides.ca/api/health | API (proxied; same for admin host) |
| http://api.can-rides.ca/api/health | API direct (HTTP until LE cert for `api`) |
| https://can-rides.ca | Redirects to https://www.can-rides.ca |

Email stays on cPanel (`mail.can-rides.ca`).

SSL: Let's Encrypt covers `www.can-rides.ca` + `can-rides.ca` (same cert) and `admin.can-rides.ca`. Apex HTTPS redirects to `https://www.can-rides.ca`. `api` still HTTP-only until its own cert is issued.

Finish API cert later:

```bash
certbot certonly --nginx -d api.can-rides.ca
```

## Auto deploy

Push to `main` → `.github/workflows/deploy.yml` SSHs to the droplet and runs `deploy/scripts/deploy.sh`.

GitHub secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.

## One-time bootstrap

See `deploy/scripts/bootstrap.sh`. Env files live on the server only:

- `/opt/cango/backend/.env`
- `/opt/cango/deploy/.env.infra`
- `/opt/cango/apps/*/.env.production.local`
- `/etc/cango/firebase-adminsdk.json`
