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
| `SITE_ADDRESS` | the server's LAN IP, e.g. `192.168.1.20` | the domain |
| `HTTP_PORT` / `HTTPS_PORT` | `8080` / `8443` (open `https://<LAN IP>:8443`) | `80` / `443` |
| `TLS_MODE` | `internal` (Caddy's local CA) | contact email for Let's Encrypt |
| `COMPOSE_PROFILES` | `mailpit` (all mail is caught) | empty |
| `SOURCE_URL` | empty (the project's repository) | empty, or the address of your own fork: the footer link "Quellcode" |
| SMTP settings | `SMTP_HOST=mailpit`, `SMTP_PORT=1025` | the real SMTP account: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`; the password in `secrets/smtp_password` (mode 600) |

## The event

An installation serves one event. There is no event folder to prepare: the event is set up in the admin area after the first start.

1. Deploy as below. The first start creates the event without a name; until the setup is done, guests see a "not set up yet" page.
2. Create the first admin on the server and give the admin the setup link it prints:

   ```sh
   docker compose exec app zappaloo create-admin <username>
   ```

3. The admin signs in and completes the setup form (name, time zone, default language). The admin area then opens. Name, time zone and language can be changed later in Einstellungen.

Features and settings start with their defaults (all features on; platform and uploads closed) and are changed in the admin area, or while the app runs with the CLI; every change is written to the audit log:

```sh
docker compose exec app zappaloo event show
docker compose exec app zappaloo event feature gallery off
docker compose exec app zappaloo event setting platformOpen on
```

`zappaloo event seed-example` sets up the example event for development and tests; it refuses staging and prod.

The theme of the event (its look and app icons) is described in [The theme](#the-theme). It lives in the data volume at `/data/events/event1/theme/` and is part of the full backup (`events/`).

## The theme

The website, the guest pages and the app icons take their look from a theme package (sw-architecture.md 19.7). Without one, the platform's default look applies, and the admin area keeps its neutral look either way.

**The package** is a `tar.gz` of at most 10 MB, unpacked at most 20 MB, with the files at the root of the archive (no folder around them):

- `manifest.json`: `kind` `zappaloo-theme`, `formatVersion` `1`, and a `name` the admin recognises the package by.
- `theme.json`: `colors` (seven `#rrggbb` values: `background`, `surface`, `text`, `muted`, `line`, `accent`, `onAccent`), and optionally `waiting` (the waiting card's `card`, `text`, `button` and `onButton`) and `fonts` (`body`, `heading`, `display`: the countdown's number).
- `icons/icon-192.png` (192×192), `icons/icon-512.png` (512×512), `icons/apple-touch-icon.png` (180×180), and optionally `icons/icon-maskable-512.png` (512×512, the content inside the central 80 %).
- Optionally, WOFF2 font files in `fonts/`, at most eight and 2 MB each, each named in `theme.json`.

The validator checks the whole package before anything changes. Text must reach a contrast of 4.5 : 1 on the background, on the surface, on the accent and, with the waiting card, on its own surface and button.

**Import and return** are in the admin area: Einstellungen › Design. A package is imported as a whole. A refused package lists every finding, with its file, and changes nothing. "Standard-Design verwenden" asks for a second click before it removes the package. Both are in the audit log.

**The example** is attached to each release as `zappaloo-theme-example.tar.gz`, next to the bundle. It has the colours of the wedding mock (name `Sommerfest`), placeholder icons and no fonts. It is a build output, not a file of the repository: `npm run build:example-theme` writes it into `dist/`.

A guest who already added the site to the home screen keeps the old icon until they add it again; the browser stores it when the app is installed.

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
| Database and files (photos, uploads, imported maps and tilesets, the event's theme) | the data volume (`DATA_VOLUME`, mounted at `/data`) | a **full backup**, below |
| Pre-deploy database backups | `backups/` | copy the folder |
| Settings | `.env` | copy the file |
| Secrets (session secret, SMTP password, registry token) | `secrets/`, `ghcr-token` | copy the folder; keep it private (mode 600) |

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

## Pilot on prod, then reset

To try the whole thing with a few trusted people before the real guests are invited (real DNS, Let's Encrypt, real mail, live updates), you can run a pilot on prod and then start again with an empty installation. The spec only forbids real mail from **staging**; prod is meant for real mail. Nothing in the tooling resets prod for you, on purpose: the steps below are manual.

**Before the pilot**

- Tell the pilot guests that this is a test and that **everything they enter is deleted afterwards**: accounts, RSVPs, allergies, companions, email addresses. It is real personal data until then, and the privacy notice (`/datenschutz`) says it is deleted after the event.
- Do not print or send the real invitation cards yet. Every invitation code, setup link and session of the pilot dies with the reset.
- Use the real SMTP account (`.env`: `COMPOSE_PROFILES` empty, `SMTP_*`, `secrets/smtp_password`). Reminder mails and "Die Tür ist offen" go to every verified address in the pilot, so invite only people who know about it.
- Decide which version the pilot runs. Prod accepts release tags only; a pilot on the first release uses that tag. If you want the real start on `v1.0.0`, run the pilot on a release candidate that has been promoted, and promote the final release after the reset.
- Nothing from the pilot needs a backup. If a file is worth keeping (e.g. the event's theme files in `/data/events/event1/`), copy it out of the volume before the reset.

**Run the pilot** as in "The event": deploy, `create-admin`, set the event up in the admin area, invite the pilot guests, open the platform when you want to test the game world.

**Reset after the pilot** (in the prod directory, e.g. `~/zappaloo-prod`):

```sh
docker compose down                                  # removes the containers, keeps the volumes
docker volume rm "$(grep '^DATA_VOLUME=' .env | cut -d= -f2)"    # the data: database, uploads, maps, event files
rm -f backups/*                                      # the pre-deploy backups and full backups hold pilot data
./deploy.sh prod <X.Y.Z>                             # the version for the real start
```

`deploy.sh` finds no running app, skips the pre-deploy backup, creates a new empty data volume and starts the stack. Caddy's volumes stay, so the Let's Encrypt certificate is kept; `secrets/` and `.env` stay too (the session secret only signs cookies, and there are no sessions left). Then:

1. Create the first admin again with `docker compose exec app zappaloo create-admin <username> --vip` and complete the event setup in the admin area.
2. Check that the installation is empty: Konten & Rollen shows only the admin, Einladungen and Rückmeldungen are empty, the platform is closed.
3. Delete pilot copies outside the host as well: off-site backups of the pilot, exported CSV files, mails you forwarded. Ask the pilot guests to delete the test mails.
4. Create the real invitations and print the cards.

`docker volume rm` and `rm backups/*` cannot be undone. Check that you are in the **prod** directory (`grep APP_ENV .env` shows `APP_ENV=prod`) before you run them.

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
