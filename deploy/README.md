# Production deploy (DigitalOcean)

## Hosts

| Host | App |
|------|-----|
| `https://can-rides.ca` | Web passenger (Next `:3002`) |
| `https://admin.can-rides.ca` | Admin (Next `:3001`) |
| `https://api.can-rides.ca` | Nest API (`:4000`, prefix `/api`) |

Email stays on cPanel (`mail.can-rides.ca`).

## One-time server setup

```bash
# from a machine with SSH to the droplet
scp -r deploy/scripts/bootstrap.sh root@DROPLET_IP:/tmp/bootstrap.sh
ssh root@DROPLET_IP 'bash /tmp/bootstrap.sh'
# then write /opt/cango/backend/.env, apps/*/.env.production.local, deploy/.env.infra
# copy Firebase JSON to /etc/cango/firebase-adminsdk.json
bash /opt/cango/deploy/scripts/deploy.sh
certbot --nginx -d can-rides.ca -d www.can-rides.ca -d api.can-rides.ca -d admin.can-rides.ca
pm2 startup systemd -u root --hp /root
```

## Auto deploy

Push to `main` runs `.github/workflows/deploy.yml` (SSH → `deploy.sh`).

Required GitHub secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.
