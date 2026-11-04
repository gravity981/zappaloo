# Deploying Zappaloo

Runbook for the deployment bundle in this folder (`compose.yaml`, `deploy.sh`, `.env.example`). Background: `spec/sw-architecture.md`, sections 23.4–23.8.

## Server prerequisites

- Linux on x86-64 (`linux/amd64`), Docker Engine with the Compose plugin (`docker compose version` ≥ 2.23).
- Ports 80 and 443 free. Staging also uses 8025 for Mailpit's web UI.
- A user that may run `docker`.

## First setup of an environment

One directory per environment, e.g. `~/zappaloo-staging` or `~/zappaloo-prod`:

```sh
mkdir -p ~/zappaloo-staging && cd ~/zappaloo-staging
# copy compose.yaml, deploy.sh and .env.example into this directory (scp, or from the release's bundle)
cp .env.example .env
chmod +x deploy.sh
nano .env          # APP_ENV, COMPOSE_PROJECT_NAME, DATA_VOLUME, SITE_ADDRESS, TLS_MODE, mail settings
```

If the image is private, create a GitHub token with only `read:packages`, store it in `ghcr-token` (`chmod 600 ghcr-token`) and set `GHCR_USER` in `.env`.

| Setting | Staging (LAN) | Prod (VPS) |
|---|---|---|
| `APP_ENV` / `COMPOSE_PROJECT_NAME` / `DATA_VOLUME` | `staging` / `zappaloo-staging` / `zappaloo-data-staging` | `prod` / `zappaloo` / `zappaloo-data-prod` |
| `SITE_ADDRESS` | the server's LAN IP, e.g. `192.168.1.20` | the domain |
| `TLS_MODE` | `internal` (Caddy's local CA) | contact email for Let's Encrypt |
| `COMPOSE_PROFILES` | `mailpit` (all mail is caught) | empty |
| SMTP settings | `SMTP_HOST=mailpit`, `SMTP_PORT=1025` | the real SMTP account |

## Deploy

```sh
./deploy.sh staging <image tag>      # e.g. main, 0.1.0_build.42, 0.1.0-rc.1
./deploy.sh prod <X.Y.Z>             # prod accepts release tags only
```

`deploy.sh` pulls the image, creates `secrets/session_secret` on the first run, backs up the prod database to `BACKUP_DIR`, starts the stack and waits until `/api/health` reports the image's version. If that fails, it prints the rollback command.

## Roll back (prod)

```sh
./deploy.sh prod <previous X.Y.Z> --restore <backup file printed by the failed deployment>
```

Data entered between the failed deployment and the rollback is lost.

## Trust staging's certificate on a test device

Staging uses Caddy's local CA. Export its root certificate once and install it on each test device (phone, laptop):

```sh
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > zappaloo-staging-root.crt
```

The CA lives in the `caddy-data` volume and survives deployments; it only changes if that volume is deleted.

## Useful commands

```sh
docker compose ps                          # status
docker compose logs -f app                 # app log
docker compose exec app zappaloo version   # version and commit
# manual database backup into ./backups (mode 600), like deploy.sh does before each prod deployment:
(umask 077 && docker compose exec -T app zappaloo backup - > backups/manual-$(date -u +%Y%m%dT%H%M%SZ).db)
```

Mailpit (staging): `http://<LAN IP>:8025`.
