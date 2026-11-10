#!/usr/bin/env bash
# Deploys an image version to this environment (sw-architecture.md 23.5, 23.7).
#
#   deploy.sh <staging|prod> <image tag>                       deploy
#   deploy.sh prod <previous image tag> --restore <backup>     roll back with a backup
#   deploy.sh staging --teardown [--yes]                       stop staging, delete its data
#
# <backup> is a file name in ./backups. Options:
#   --no-pull      use an image that exists locally (tests, local builds)
#   --no-restore   staging: keep the current data instead of restoring the latest
#                  full backup (the newest ./backups/*.tar.gz, provided by the operator)
# Environment: DEPLOY_HEALTH_TIMEOUT (seconds to wait for a healthy app, default 90)
#
# Runs in the environment's directory: compose.yaml, .env, secrets/, backups/.
# Backups are streamed out of and into the container through the Docker CLI, so
# they belong to the user running deploy.sh (mode 600) and need no bind mount.
set -euo pipefail

REPOSITORY=ghcr.io/gravity981/zappaloo
HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-90}

die() { echo "deploy.sh: $*" >&2; exit 1; }
usage() { sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[ $# -ge 2 ] || usage
target=$1
tag=$2
shift 2
restore=""
pull=1
restore_latest=1
teardown=""
yes=""
if [ "$tag" = "--teardown" ]; then teardown=1; tag=""; fi
while [ $# -gt 0 ]; do
  case $1 in
    --restore) restore=${2:?--restore needs a backup file name}; shift 2 ;;
    --no-pull) pull=""; shift ;;
    --no-restore) restore_latest=""; shift ;;
    --yes) yes=1; shift ;;
    *) usage ;;
  esac
done
[ -z "$yes" ] || [ -n "$teardown" ] || usage

cd "$(dirname "$0")"
[ -f .env ] || die "no .env in $(pwd); copy .env.example and adjust it"

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
env_set() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

# --- Checks ----------------------------------------------------------------------
case $target in
  prod)
    [ -z "$teardown" ] || die "--teardown is only for staging"
    [[ $tag =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] \
      || die "prod accepts only release image tags (X.Y.Z), not '$tag'"
    ;;
  staging) ;;
  *) usage ;;
esac
[ "$tag" != "latest" ] || die "the tag 'latest' is never deployed; name the version"
[ "$(env_get APP_ENV)" = "$target" ] \
  || die "this directory is for APP_ENV=$(env_get APP_ENV), not $target"

# --- Teardown (staging only) -------------------------------------------------------
# Staging holds a copy of real guest data and runs only while a candidate is
# verified; afterwards its containers stop and its data volume is deleted (OPS-13).
# Caddy's volumes stay, so test devices keep trusting the same local CA.
if [ -n "$teardown" ]; then
  [ "$target" = "staging" ] || die "--teardown is only for staging"
  data_volume=$(env_get DATA_VOLUME)
  [ -n "$data_volume" ] || die "DATA_VOLUME is not set in .env"
  if [ -z "$yes" ]; then
    [ -t 0 ] || die "this deletes the volume $data_volume; confirm with --yes"
    read -r -p "Delete the volume $data_volume and stop staging? [y/N] " answer
    [[ $answer =~ ^[yY]$ ]] || die "cancelled"
  fi
  # Compose reads these only to interpolate the file; nothing is started.
  IMAGE_TAG=$(env_get IMAGE_TAG) SESSION_SECRET=unused docker compose down --remove-orphans
  if docker volume inspect "$data_volume" > /dev/null 2>&1; then
    docker volume rm "$data_volume" > /dev/null
  fi
  echo "Staging stopped; volume $data_volume deleted."
  exit 0
fi

image="$REPOSITORY:$tag"
previous_tag=$(env_get IMAGE_TAG)
suffix=""
if [[ $tag =~ -(rc\.[0-9]+)$ ]]; then suffix=${BASH_REMATCH[1]}; fi

# Pre-deploy database backups (mode 600). May be a symlink to another disk.
backup_dir=./backups

compose() { docker compose "$@"; }
app_running() { [ -n "$(compose ps --status running --quiet app 2>/dev/null)" ]; }

# --- 1. Image ----------------------------------------------------------------------
if [ -n "$pull" ]; then
  if [ -f ghcr-token ]; then
    ghcr_user=$(env_get GHCR_USER)
    [ -n "$ghcr_user" ] || die "ghcr-token exists, but GHCR_USER in .env is empty; set it to the GitHub user name of the token"
    docker login ghcr.io --username "$ghcr_user" --password-stdin < ghcr-token
  fi
  docker pull "$image"
fi
docker image inspect "$image" > /dev/null 2>&1 || die "image $image not found"
expected_version=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$image")
[ -n "$expected_version" ] || die "image $image has no version label"
expected_version="$expected_version${suffix:+-$suffix}"

# --- 2. Secret, backup, staging data ---------------------------------------------------
mkdir -p secrets
if [ ! -s secrets/session_secret ]; then
  (umask 077 && head -c 48 /dev/urandom | base64 | tr -d '\n' > secrets/session_secret)
  echo "Created secrets/session_secret."
fi
chmod 600 secrets/session_secret
SESSION_SECRET=$(cat secrets/session_secret)
export SESSION_SECRET

# Fingerprint of everything that shapes the Caddy configuration (compose.yaml label).
CADDY_CONFIG_HASH=$(printf '%s\n%s\n' "$(env_get SITE_ADDRESS)" "$(env_get TLS_MODE)" \
  | cat compose.yaml - | sha256sum | cut -c1-16)
export CADDY_CONFIG_HASH

backup=""
if [ "$target" = "prod" ] && [ -z "$restore" ]; then
  if app_running; then
    running_version=$(compose exec -T app zappaloo version | cut -d' ' -f1)
    backup="$(date -u +%Y%m%dT%H%M%SZ)_${running_version}.db"
    (umask 077 && mkdir -p "$backup_dir")
    if ! (umask 077 && compose exec -T app zappaloo backup - > "$backup_dir/$backup"); then
      rm -f "$backup_dir/$backup"
      die "the database backup failed; nothing was deployed"
    fi
    echo "Backed up the database to backups/$backup."
  else
    echo "The app is not running: no backup before this deployment (first deployment?)."
  fi
elif [ "$target" = "staging" ] && [ -n "$restore_latest" ]; then
  # The operator copies the latest off-site full backup into ./backups (sw-architecture.md 22.2).
  # Newest by modification time; `|| true`: no backup is not an error.
  staging_backup=$(cd "$backup_dir" 2> /dev/null && ls -t -- *.tar.gz 2> /dev/null | head -n 1 || true)
  if [ -z "$staging_backup" ]; then
    echo "Warning: no full backup (backups/*.tar.gz) found: staging keeps its current data" \
      "(empty on the first deployment)."
  else
    # Staging holds a copy of real guest data: its mail must be caught (OPS-13).
    [[ ,$(env_get COMPOSE_PROFILES), == *,mailpit,* && "$(env_get SMTP_HOST)" = "mailpit" ]] \
      || die "refusing to restore guest data into staging: set COMPOSE_PROFILES=mailpit and SMTP_HOST=mailpit in .env so that no mail reaches real recipients"
  fi
fi

# --- 3. Start ------------------------------------------------------------------------
env_set IMAGE_TAG "$tag"
env_set APP_VERSION_SUFFIX "$suffix"
if [ -n "$pull" ]; then compose pull --quiet; fi

if [ -n "${staging_backup:-}" ]; then
  echo "Replacing the staging data with the full backup backups/$staging_backup."
  compose down --remove-orphans
  if docker volume inspect "$(env_get DATA_VOLUME)" > /dev/null 2>&1; then
    docker volume rm "$(env_get DATA_VOLUME)" > /dev/null
  fi
  # A one-off container creates the new, empty data volume and reads the backup from stdin.
  compose run --rm --no-deps -T app zappaloo restore --full - --force < "$backup_dir/$staging_backup" \
    || die "restoring backups/$staging_backup failed; staging has no data (fix the backup, deploy again)"
fi

if [ -n "$restore" ]; then
  [ -f "$backup_dir/$restore" ] || die "backup $backup_dir/$restore not found"
  echo "Restoring the database from backups/$restore."
  compose stop app
  # A one-off container on the same data volume reads the backup from stdin.
  compose run --rm --no-deps -T app zappaloo restore - --force < "$backup_dir/$restore"
fi
compose up --detach --remove-orphans

# --- 4. Verify -------------------------------------------------------------------------
# The app applies migrations on startup (DATA-04) and does not start if they fail.
echo "Waiting for the app to report version $expected_version ..."
reported=""
for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
  reported=$(compose exec -T app node -e '
    fetch("http://127.0.0.1:3000/api/health")
      .then((r) => r.json())
      .then((h) => { if (h.status === "ok") console.log(h.version); })
      .catch(() => {});
  ' 2> /dev/null || true)
  [ "$reported" = "$expected_version" ] && break
  sleep 1
done

if [ "$reported" != "$expected_version" ]; then
  echo "DEPLOYMENT FAILED: the app did not report a healthy version $expected_version" \
    "(last answer: '${reported:-none}')." >&2
  compose logs --tail 30 app >&2 || true
  if [ "$target" = "prod" ] && [ -n "$previous_tag" ] && [ -n "$backup" ]; then
    echo "Roll back with: $0 prod $previous_tag --restore $backup" >&2
  elif [ -n "$previous_tag" ]; then
    echo "Roll back with: $0 $target $previous_tag" >&2
  fi
  exit 1
fi
echo "Deployed $image to $target: healthy, version $reported."
