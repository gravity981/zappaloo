# One-shot runbook: Release 1 from candidate to prod

A checklist for the first release: build a release candidate, verify it on staging (including real phones), promote it, install it on prod and do the first setup of the event, the accounts and the invitations. Follow it top to bottom. The permanent reference is [README.md](README.md); this file only orders the steps.

Replace these in the commands: `VERSION` (e.g. `1.0.0`; it must be higher than the latest release), `LAN_IP` (the staging server's address in your network), `DOMAIN` (prod's domain). The release candidates are numbered by the workflow (`v1.0.0-rc.1`, `-rc.2`, …); use the tag it prints.

Everything on prod is real: take the time at the steps marked **STOP**.

---

## 0. Before you start

- [ ] The branch `feature/stage-3.5` is merged into `main` (pull request), and **CI is green on the merge commit**. The candidate workflow refuses anything else.
- [ ] The GitHub repository is **public**, or you know what `SOURCE_URL` should be (footer link "Quellcode", AGPL-3.0 §13). Also needed for the tag ruleset (OPS-12).
- [ ] The host(s) meet the prerequisites in [README.md](README.md): Docker with Compose ≥ 2.23, a user that may run `docker`.
- [ ] **Prod:** `DOMAIN` points to the host's public IP, ports 80 and 443 are forwarded to it, and you have a real SMTP account (host, port, user, password, a sender address).
- [ ] **Staging:** reachable in your LAN. If it runs on the same machine as prod: ports 8080/8443 and Mailpit's 8025.
- [ ] If the image is private: a GitHub token with only `read:packages` in `ghcr-token` (mode 600) and `GHCR_USER` in `.env`.
- [ ] Facts about the event at hand: name, time zone, the program items (name, time, place; which has the meal), the menu list, the RSVP deadline, the guest names, optional icon PNGs (see 5.6).

---

## 1. Build the release candidate

From any machine with the GitHub CLI (`gh auth status` must work), or use the **Actions** tab → *Release candidate* → *Run workflow* on `main`:

```sh
gh workflow run release-candidate.yml --ref main -f version=VERSION
gh run watch                       # pick the "Release candidate" run; takes a few minutes (full test suite, image build)
gh release list --limit 3          # the pre-release v<VERSION>-rc.<N>
```

- [ ] The workflow finished green. Note the tag, e.g. `v1.0.0-rc.1`; the image tag is the same without the `v`: `1.0.0-rc.1`.
- [ ] The pre-release page lists the install commands (first installation and update) with the bundle's download address. **Copy them from there**: they are exact.

---

## 2. Install the candidate on staging

On the staging server:

```sh
mkdir -p ~/zappaloo-staging && cd ~/zappaloo-staging
curl -fsSL "<bundle URL from the release notes>" | tar -xz --strip-components=1
cp .env.example .env
chmod +x deploy.sh
nano .env
```

In `.env` (details in the table of [README.md](README.md)):

| Setting | Value |
|---|---|
| `APP_ENV` / `COMPOSE_PROJECT_NAME` / `DATA_VOLUME` | `staging` / `zappaloo-staging` / `zappaloo-data-staging` |
| `SITE_ADDRESS` | `LAN_IP` |
| `HTTP_PORT` / `HTTPS_PORT` | `8080` / `8443` |
| `TLS_MODE` | `internal` |
| `COMPOSE_PROFILES` | `mailpit` |
| `SMTP_HOST` / `SMTP_PORT` | `mailpit` / `1025` |
| `SOURCE_URL` | empty |

```sh
./deploy.sh staging VERSION-rc.1
```

> **Candidates built before the fix of 2026-11-11 stop with** `ConfigError: SMTP_PASSWORD_FILE: cannot read /run/secrets/smtp_password`. Newer Docker Compose versions do not mount an empty secret, and Mailpit needs no password. Workaround for such a candidate only (a candidate with the fix needs nothing): give the secret any value, which nobody uses because staging has no mail login (`SMTP_USER` is empty), then deploy again:
>
> ```sh
> (umask 077 && printf 'unused' > secrets/smtp_password)
> ./deploy.sh staging VERSION-rc.1 --no-pull
> ```
>
> **Variables exported in your shell win over `.env`** in Docker Compose. If `env | grep -E '^(APP_ENV|SMTP_|PUBLIC_URL|SITE_ADDRESS|MAIL_FROM)'` prints anything on the server, `unset` it (e.g. `unset APP_ENV SMTP_HOST`) before you run `deploy.sh`; otherwise the app can run with the wrong environment (not Secure cookies, `seed-example` allowed).

- [ ] It ends with "healthy" and the candidate's version. There is **no prod backup yet**, so the warning "no full backup found: staging keeps its current data (empty on the first deployment)" is expected: staging starts empty.
- [ ] `docker compose exec app zappaloo version` shows the candidate's version.

### 2.1 Staging needs a certificate the phones trust

`TLS_MODE=internal` uses Caddy's own certificate authority. A browser tab can accept the warning, but **an app on the home screen cannot**, and Chrome does not offer "install" on an untrusted certificate. Install the root certificate on each test phone before the device check (steps from general iOS/Android behaviour, not tried here):

```sh
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > zappaloo-staging-root.crt
```

Copy the file to the phone (AirDrop, mail, USB), then:

- **iPhone:** open the file → *Profile downloaded* → Settings → *Profile Downloaded* → Install. Then Settings → General → About → *Certificate Trust Settings* → switch on full trust for it.
- **Android:** Settings → Security (or Privacy) → *Encryption & credentials* → *Install a certificate* → *CA certificate* → choose the file.

The CA survives deployments (volume `caddy-data`); do not delete that volume until the checks are done.

---

## 3. Verify the candidate on staging

Open `https://LAN_IP:8443`. Mail is caught at `http://LAN_IP:8025`.

### 3.1 Accounts and setup (test data, staging is thrown away later)

```sh
docker compose exec app zappaloo create-admin tester --vip     # prints a one-time link
```

- [ ] Open the link, set a password, sign in.
- [ ] The form *Veranstaltung einrichten* appears: name, time zone, language → *Einrichtung abschliessen*.
- [ ] Einstellungen → *Rückmeldung*: add two program items (one with the meal), a menu, a deadline. *Footer*: edit the *Fusszeile* line, see it under the page.
- [ ] Einladungen: create one invitation for a test guest, *Karten drucken* (look at the print preview). Open the invitation link in a second browser profile or phone, register, answer the RSVP.
- [ ] The platform is closed: the guest sees the waiting page and the RSVP, not the website.
- [ ] Einstellungen → *Plattform öffnen* with the mail option: the "Die Tür ist offen" mail arrives in Mailpit (needs a verified address of the guest: add one in the guest's profile and confirm it with the mail). *Wieder schliessen* closes it again.

### 3.2 Real devices (step 3.5e: PWA-01 – PWA-05)

Do this on a real iPhone (Safari) and a real Android phone (Chrome), with the certificate from 2.1:

- [ ] `https://LAN_IP:8443/manifest.webmanifest` loads in the phone's browser; the icon `…/app-icons/icon-192.png` shows the Z.
- [ ] The strip "… als App auf dem Startbildschirm?" is on the waiting page (guest account, platform closed); *So geht's* opens the steps for that platform; × hides the strip for good on that phone. The profile has the card *App*.
- [ ] **iPhone:** Share → *Zum Home-Bildschirm* → the home screen icon has the event's name and the Z. **Android:** the *Installieren* button opens the browser's prompt (or the menu path works).
- [ ] Open the app from the home screen: **no browser bars**, nothing hides under the notch or the home indicator (waiting page, RSVP, profile, login), every page has a way back.
- [ ] The app asks for the password once more (cookies of a home screen app are separate); after that it stays signed in.
- [ ] Neither the strip nor the card appear inside the installed app.

Note date, phones and result; they go into the manual test protocol later (section 8).

### 3.3 Finish

- [ ] A problem? Fix it on `main`, build the next candidate (`rc.2`, step 1) and deploy it with `./deploy.sh staging VERSION-rc.2` (staging keeps its data with `--no-restore`).
- [ ] All good: `./deploy.sh staging --teardown` (asks for confirmation; deletes staging's data, keeps Caddy's CA). `docker compose stop` if you prefer to keep it for later.

---

## 4. Promote the candidate to the release

**STOP.** Promote only the candidate you verified. Promotion does not rebuild: it tags `v<VERSION>` on the same commit and adds the image tags to the same image.

```sh
gh workflow run promote.yml --ref main -f candidate=v1.0.0-rc.1      # the verified candidate tag
gh run watch
docker buildx imagetools inspect ghcr.io/gravity981/zappaloo:VERSION   # the image exists under the release tag
```

- [ ] The GitHub release `v<VERSION>` exists, marked *latest*, with the bundle and its install commands.

---

## 5. Install the release on prod

**STOP.** This is the real installation. Check that you are on the prod host and in the prod directory.

### 5.1 Directory and bundle

```sh
mkdir -p ~/zappaloo-prod && cd ~/zappaloo-prod
curl -fsSL "<bundle URL from the release notes of v<VERSION>>" | tar -xz --strip-components=1
cp .env.example .env
chmod +x deploy.sh
nano .env
```

### 5.2 `.env` for prod

| Setting | Value |
|---|---|
| `APP_ENV` / `COMPOSE_PROJECT_NAME` / `DATA_VOLUME` | `prod` / `zappaloo` / `zappaloo-data-prod` |
| `SITE_ADDRESS` | `DOMAIN` |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` |
| `TLS_MODE` | your contact email (Let's Encrypt) |
| `COMPOSE_PROFILES` | empty |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM` | the real mail account and sender |
| `SOURCE_URL` | empty (the project's repository) or your fork |

```sh
mkdir -p secrets && (umask 077 && printf '%s' '<the SMTP password>' > secrets/smtp_password)   # skip if the mail server has no login
```

### 5.3 Deploy

```sh
./deploy.sh prod VERSION
```

- [ ] It ends healthy with `VERSION`. (Nothing to back up yet on the first deployment.)
- [ ] `https://DOMAIN` opens with a **valid Let's Encrypt certificate** (the first request may take a moment while it is issued).
- [ ] Live updates pass through Caddy one by one, not all at the end:

  ```sh
  curl -N "https://DOMAIN/api/events/ping?count=3&intervalMs=1000"     # three events, one second apart
  ```

- [ ] `https://DOMAIN/manifest.webmanifest`, `https://DOMAIN/license` and `https://DOMAIN/datenschutz` load. The footer link *Quellcode* opens a **public** repository.

### 5.4 The first admin

```sh
docker compose exec app zappaloo create-admin <your-username> --vip     # --vip: you are also a guest and can try the RSVP
```

It prints a one-time link (valid 24 hours, works once). Open it, set your password.

### 5.5 First backup (do it now, and again after the setup in section 6)

```sh
mkdir -p backups
(umask 077 && docker compose exec -T app zappaloo backup --full - > backups/full-$(date -u +%Y%m%dT%H%M%SZ).tar.gz)
```

Copy the file to your off-site storage. It holds personal data: mode 600, delete it at shutdown.

### 5.6 Optional: your own icons and colours

The look of the website and the app icons come from a theme package. The package, the import in Einstellungen › Design and the example are described in [The theme](README.md#the-theme) of this runbook.

They are part of the full backup (`events/`).

---

## 6. Initial setup of the event, accounts and invitations

Sign in at `https://DOMAIN` with the admin. Do the steps in this order: invitations need the program items, and the platform stays closed until you open it.

### 6.1 The event

- [ ] *Veranstaltung einrichten*: name, time zone, default language → *Einrichtung abschliessen*. The admin area opens.

### 6.2 Einstellungen

- [ ] **Rückmeldung:** the program items (name, time, place), the program item with the meal marked, the menu list (children's menu included), the RSVP deadline (last day), the song wish question on or off.
- [ ] **Plattform öffnen / Warteseite:** the three waiting-page texts (defaults exist), an optional opening date and the countdown switch. **Do not open the platform now.** It stays closed until the day you decide.
- [ ] **Datenschutz:** read the German default text; it is a draft and needs your legal review. Edit it if needed.
- [ ] **Fusszeile:** the copyright line under every page (default `© <year> <event name>`); leave it or change it.
- [ ] **Features:** the defaults (all on) are fine for Release 1; the game world and the other features are not built yet.

### 6.3 Accounts and roles (Konten & Rollen)

- [ ] Other organisers: *Konto anlegen*, give the roles (`admin`, or `staff` with its capabilities) and hand over the setup link shown **once** (valid 24 hours). A locked-out person gets a new link with `docker compose exec app zappaloo reset-password <username>`.
- [ ] Optional: guest groups (they matter for access conditions of later features).

### 6.4 Invitations (Einladungen)

- [ ] *Neue Einladungen*: one guest name per line, *Eingeladen zu* (the chips: the program items each guest may answer for), an optional expiry date → *Einladungen erstellen*.
- [ ] **The codes are visible only now.** *Karten drucken* before you leave the page (print preview, or save as PDF). Lost a code? *Neu erzeugen* on the row makes a new one and replaces the old.
- [ ] Check one card end to end: scan the QR code with a phone, redeem, answer the RSVP, look at it under *Rückmeldungen*. Then *Widerrufen* that test invitation if it was not meant for a real guest (invitations can be revoked, not deleted), or create it with a name you can recognise.
- [ ] Hand the cards out.

### 6.5 Then

- [ ] Take another full backup (5.5).
- [ ] Reminders for guests without an answer: *Rückmeldungen* → *Erinnern (n)* (only guests with a verified address).

---

## 7. The same checks on prod (step 3.5f)

- [ ] Let's Encrypt certificate valid, live updates one by one (5.3).
- [ ] The invitation print export checked end to end with a real card (6.4).
- [ ] The privacy notice reviewed (6.2).
- [ ] On a real phone with a **trusted** certificate (prod has one): add the site to the home screen, open it as an app, the strip and card behave as in 3.2.
- [ ] The footer: copyright line, license sentence, *Quellcode* opens the public repository, *Lizenz* shows the AGPL.

---

## 8. Afterwards

- [ ] Tell me (or add rows yourself) when everything works on prod and stage 4 starts: the checks go into [spec/manual-test-protocol.md](../../spec/manual-test-protocol.md) (staging for PWA-01 – PWA-05, prod for LIC-03 and OPS-02), and the "not yet tested" list in `spec/test-strategy.md` is cleared.
- [ ] Schedule the backups (cron) and the off-site copy (README: *Backups and restore*).

## If something goes wrong

- **`SMTP_PASSWORD_FILE: cannot read /run/secrets/smtp_password`** on a candidate older than the fix: see the note under 2 (a dummy `secrets/smtp_password`), or build the next candidate from `main` with the fix.
- **Staging deployment fails to become healthy:** `docker compose logs app`; fix, build the next candidate.
- **Prod deployment fails:** `deploy.sh` prints the rollback command: `./deploy.sh prod <previous X.Y.Z> --restore <backup file>`. On the very first deployment there is nothing to roll back to: `docker compose down` and fix the cause (`.env`, DNS, ports), then deploy again.
- **A mistake in the invitations or in the test data on prod:** nothing resets prod for you. See *Pilot on prod, then reset* in [README.md](README.md) (it deletes the data volume: check you are in the prod directory).
- **Locked out of the admin account:** `docker compose exec app zappaloo reset-password <username>`.
