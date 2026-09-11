# Production deploy (DigitalOcean)

## Live URLs

| URL | App |
|-----|-----|
| https://www.can-rides.ca | Passenger web |
| https://admin.can-rides.ca | Admin |
| https://www.can-rides.ca/api/health | API (proxied; same for admin host) |
| http://api.can-rides.ca/api/health | API direct (HTTP until LE cert for `api`/`apex`) |

Email stays on cPanel (`mail.can-rides.ca`).

SSL note: Let's Encrypt currently issued for `www` + `admin`. Apex (`can-rides.ca`) and `api` hit intermittent LE DNS secondary-validation failures against `ns*.mzcorp.com`. Until those certs succeed, apps call the API over the HTTPS hosts above.

Finish remaining certs later:

```bash
certbot certonly --nginx -d can-rides.ca -d api.can-rides.ca
certbot --nginx --expand -d can-rides.ca -d www.can-rides.ca -d api.can-rides.ca -d admin.can-rides.ca --redirect
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
