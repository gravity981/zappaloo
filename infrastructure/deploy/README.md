# Deploying Zappaloo

Runbook for the deployment bundle in this folder (`compose.yaml`, `deploy.sh`, `.env.example`). Background: `spec/sw-architecture.md`, sections 21–23. Hosting is the operator's job: the project ships the image and this bundle.

## Host prerequisites (provided by the operator)

- Linux on x86-64 (`linux/amd64`), Docker Engine with the Compose plugin (`docker compose version` ≥ 2.23), and a user that may run `docker`.
- **Prod:** a domain whose DNS record points to the host's public IP (dynamic DNS if it changes), and ports 80 and 443 reachable from the internet (router port forwarding). Let's Encrypt needs both.
- **Staging:** reachable only in your network. On the same machine as prod it uses ports 8080/8443, plus 8025 for Mailpit's web UI.
- Network, router, firewall, SSH and operating system updates are yours; the stack itself publishes only Caddy's ports (and Mailpit's on staging).

## First setup of an environment

One directory per environment, e.g. `~/zappaloo-staging` or `~/zappaloo-prod`:

```sh
mkdir -p ~/zappaloo-staging && cd ~/zappaloo-staging
# unpack the release's bundle here (the commands are in the release notes):
#   curl -fsSL <bundle URL> | tar -xz --strip-components=1
cp .env.example .env
chmod +x deploy.sh
nano .env          # APP_ENV, COMPOSE_PROJECT_NAME, DATA_VOLUME, SITE_ADDRESS, TLS_MODE, mail settings
```

If the image is private, create a GitHub token with only `read:packages`, store it in `ghcr-token` (`chmod 600 ghcr-token`) and set `GHCR_USER` in `.env` to the GitHub user name the token belongs to.

| Setting | Staging (LAN) | Prod |
|---|---|---|
| `APP_ENV` / `COMPOSE_PROJECT_NAME` / `DATA_VOLUME` | `staging` / `zappaloo-staging` / `zappaloo-data-staging` | `prod` / `zappaloo` / `zappaloo-data-prod` |
| `EVENT_SLUG` | the event folder (see "The event" below) | the event folder; set it before the first start: the database is tied to that event |
| `SITE_ADDRESS` | the server's LAN IP, e.g. `192.168.1.20` | the domain |
| `HTTP_PORT` / `HTTPS_PORT` | `8080` / `8443` (open `https://<LAN IP>:8443`) | `80` / `443` |
| `TLS_MODE` | `internal` (Caddy's local CA) | contact email for Let's Encrypt |
| `COMPOSE_PROFILES` | `mailpit` (all mail is caught) | empty |
| SMTP settings | `SMTP_HOST=mailpit`, `SMTP_PORT=1025` | the real SMTP account: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`; the password in `secrets/smtp_password` (mode 600) |

## The event

An installation serves one event. `EVENT_SLUG` in `.env` names its folder `events/<slug>/` (`event.json`, `theme.json`). The application looks for it first in the data volume (`/data/events/<slug>/`), then in the image, which ships the example event `event-muster`. The application does not start if the event is missing or invalid; it prints every problem with the file name.

A **private event** stays out of the public repository and lives in the data volume. Put it there **before the first deployment** of the environment, with the image you are going to deploy:

```sh
# our-day/ is the folder with event.json and theme.json; EVENT_SLUG=our-day is set in .env
docker run --rm -v "<DATA_VOLUME from .env>:/data" -v "$PWD/our-day:/event:ro" \
  ghcr.io/gravity981/zappaloo:<image tag> sh -c 'mkdir -p /data/events && cp -r /event /data/events/our-day'
./deploy.sh <staging|prod> <image tag>
```

An installation serves exactly one event: a database created for one event is refused when `EVENT_SLUG` selects another. To change an event's files later, replace the folder in the volume the same way and deploy again.

`event.json` is read when the app starts: the name, time zone and default language are refreshed from it, while features and settings are only initial values. Change them while the app runs with the CLI; every change is written to the audit log:

```sh
docker compose exec app zappaloo event show
docker compose exec app zappaloo event feature gallery off
docker compose exec app zappaloo event setting platformOpen on
```

The private event folder is part of the full backup (`events/`).

## Deploy

```sh
./deploy.sh staging <image tag>      # e.g. main, 0.1.0_build.42, 0.1.0-rc.1
./deploy.sh prod <X.Y.Z>             # prod accepts release tags only
```

`deploy.sh` pulls the image, creates `secrets/session_secret` on the first run, backs up the prod database to `./backups` (mode 600; make `backups` a symlink to keep them on another disk), starts the stack and waits until `/api/health` reports the image's version. If that fails, it prints the rollback command.

On **staging**, `deploy.sh` instead replaces the data with the newest full backup (`./backups/*.tar.gz`), if there is one; see "Backups and restore" below.

## Accounts

The first admin of an installation is created with the CLI, once the app runs. It prints a **one-time link** (valid 24 hours, works once) where the new admin sets the password; no password is ever typed on the command line:

```sh
docker compose exec app zappaloo create-admin <username> --vip     # --vip: the admin is also a guest
docker compose exec app zappaloo reset-password <username>         # a locked-out user gets a new one-time link
```

The link starts with the site address (`https://<SITE_ADDRESS>:<HTTPS_PORT>`, set by Compose). Further accounts are created by an admin in the app, or by invitation. A user changes the password in the profile, which ends their other sessions; sessions last a year and renew with use. Logins are rate-limited per user and per client address (the address comes from Caddy). `secrets/session_secret` signs the session cookies: if it changes, everybody has to sign in again.

## Backups and restore

What to back up (everything else is rebuilt by `deploy.sh`):

| What | Where | How |
|---|---|---|
| Database and files (photos, uploads, imported maps and tilesets, a private event) | the data volume (`DATA_VOLUME`, mounted at `/data`) | a **full backup**, below |
| Pre-deploy database backups | `backups/` | copy the folder |
| Settings | `.env` | copy the file |
| Secrets (session secret, SMTP password, registry token) | `secrets/`, `ghcr-token` | copy the folder; keep it private (mode 600) |
| Event bootstrap files | `events/<slug>/` (identity, theme, initial settings, graphics) | kept in the repository; the settings edited later live in the data volume, covered by the full backup |

Caddy's volumes need no backup: certificates are issued again. Backups contain personal data: keep them readable only by you, and delete them at shutdown together with all other personal data. Scheduling (e.g. cron) and the off-site storage are yours; the tools below make the file.

**Full backup** (database and files), while the app runs, into one `.tar.gz` archive (mode 600):

```sh
(umask 077 && docker compose exec -T app zappaloo backup --full - > backups/full-$(date -u +%Y%m%dT%H%M%SZ).tar.gz)
```

Then copy the file to the off-site storage (e.g. `rsync`, `rclone`). Only database: `zappaloo backup -` (see "Useful commands").

**Restore** a full backup, e.g. after losing the host. The app must be stopped; the restore replaces the database and both file folders:

```sh
docker compose stop app
docker compose run --rm --no-deps -T app zappaloo restore --full - --force < backups/<file>.tar.gz
./deploy.sh <staging|prod> <current IMAGE_TAG from .env>     # migrates the restored database and starts the app
```

An invalid archive is refused and leaves the data untouched. Do a restore drill (below) before you rely on a backup.

### Verifying a release candidate on staging (restore drill)

Staging holds a copy of real guest data while a candidate is verified, so it runs only for that time and its data is deleted afterwards.

1. Copy the latest full backup of prod from the off-site storage into staging's `backups/` folder (the newest `*.tar.gz` is used). Check that `.env` has `COMPOSE_PROFILES=mailpit` and `SMTP_HOST=mailpit`: `deploy.sh` refuses to restore guest data otherwise, so no mail reaches real recipients.
2. `./deploy.sh staging <release candidate tag>` replaces the staging data volume with the backup, migrates it and starts the candidate. `--no-restore` keeps the current staging data instead.
3. Verify the candidate on the LAN (`https://<LAN IP>:8443`; caught mail in Mailpit at port 8025).
4. `./deploy.sh staging --teardown` stops staging and deletes its data volume after a confirmation (`--yes` skips the question). Caddy's volumes stay, so test devices keep trusting the same certificate. Delete the backup copy from `backups/` too.

## Stop, start, restart

In the environment's directory (`~/zappaloo-staging` or `~/zappaloo-prod`):

```sh
docker compose stop             # stop everything; data stays in the volumes
docker compose start            # start the stopped containers again
docker compose restart app      # restart only the app (or: caddy)
```

To (re)create containers – after a change of `.env` or `compose.yaml`, or after `docker compose down` – use `./deploy.sh <staging|prod> <current IMAGE_TAG from .env>`, not `docker compose up`: `deploy.sh` provides the session secret and the Caddy fingerprint and checks the health afterwards. `docker compose down` removes the containers but keeps the data volumes; never add `-v`, which deletes the data.

Staging runs only while a release candidate is verified (sw-architecture.md 23.4): `docker compose stop` when done.

## Roll back (prod)

```sh
./deploy.sh prod <previous X.Y.Z> --restore <backup file printed by the failed deployment>
```

Data entered between the failed deployment and the rollback is lost.

## Staging's certificate on a test device

Staging uses Caddy's local CA, which browsers don't know. On each device, open `https://<LAN IP>` once and accept the warning (Firefox: **Advanced → Accept the Risk and Continue**; Chrome/Edge: **Advanced → Proceed**; Safari on iPhone: **Show Details → visit this website**). The browser remembers it for that address.

Optional, to get rid of the warning on a device: export the root certificate and install it there as a trusted authority (Firefox: Settings → Privacy & Security → View Certificates → Authorities → Import):

```sh
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > zappaloo-staging-root.crt
```

The CA lives in the `caddy-data` volume and survives deployments; it only changes if that volume is deleted.

## Useful commands

```sh
docker compose ps                          # status
docker compose logs -f app                 # app log
docker compose exec app zappaloo version   # version and commit
# manual database-only backup into ./backups (mode 600), like deploy.sh does before each prod deployment:
(umask 077 && docker compose exec -T app zappaloo backup - > backups/manual-$(date -u +%Y%m%dT%H%M%SZ).db)
```

Mailpit (staging): `http://<LAN IP>:8025`.
