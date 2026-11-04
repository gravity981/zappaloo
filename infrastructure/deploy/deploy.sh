#!/usr/bin/env bash
# Deploys an image version to this environment (sw-architecture.md 23.5, 23.7).
#
#   deploy.sh <staging|prod> <image tag>                       deploy
#   deploy.sh prod <previous image tag> --restore <backup>     roll back with a backup
#
# <backup> is a file name in BACKUP_DIR. Options:
#   --no-pull   use an image that exists locally (tests, local builds)
# Environment: DEPLOY_HEALTH_TIMEOUT (seconds to wait for a healthy app, default 90)
#
# Runs in the environment's directory: compose.yaml, .env, secrets/, backups/.
set -euo pipefail

REPOSITORY=ghcr.io/gravity981/zappaloo
HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-90}

die() { echo "deploy.sh: $*" >&2; exit 1; }
usage() { sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[ $# -ge 2 ] || usage
target=$1
tag=$2
shift 2
restore=""
pull=1
while [ $# -gt 0 ]; do
  case $1 in
    --restore) restore=${2:?--restore needs a backup file name}; shift 2 ;;
    --no-pull) pull=""; shift ;;
    *) usage ;;
  esac
done

cd "$(dirname "$0")"
[ -f .env ] || die "no .env in $(pwd); copy .env.example and adjust it"

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
env_set() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

# --- Checks ----------------------------------------------------------------------
case $target in
  prod)
    [[ $tag =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] \
      || die "prod accepts only release image tags (X.Y.Z), not '$tag'"
    ;;
  staging) ;;
  *) usage ;;
esac
[ "$tag" != "latest" ] || die "the tag 'latest' is never deployed; name the version"
[ "$(env_get APP_ENV)" = "$target" ] \
  || die "this directory is for APP_ENV=$(env_get APP_ENV), not $target"

image="$REPOSITORY:$tag"
previous_tag=$(env_get IMAGE_TAG)
suffix=""
if [[ $tag =~ -(rc\.[0-9]+)$ ]]; then suffix=${BASH_REMATCH[1]}; fi

compose() { docker compose "$@"; }
app_running() { [ -n "$(compose ps --status running --quiet app 2>/dev/null)" ]; }

# --- 1. Image ----------------------------------------------------------------------
if [ -n "$pull" ]; then
  if [ -f ghcr-token ]; then
    docker login ghcr.io --username "$(env_get GHCR_USER)" --password-stdin < ghcr-token
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

backup=""
if [ "$target" = "prod" ] && [ -z "$restore" ]; then
  if app_running; then
    compose exec -T --user root app chown node:node /backups
    running_version=$(compose exec -T app zappaloo version | cut -d' ' -f1)
    backup="$(date -u +%Y%m%dT%H%M%SZ)_${running_version}.db"
    compose exec -T app zappaloo backup "/backups/$backup"
    echo "Backed up the database to BACKUP_DIR/$backup."
  else
    echo "The app is not running: no backup before this deployment (first deployment?)."
  fi
elif [ "$target" = "staging" ]; then
  echo "Note: restoring the latest off-site backup into staging is set up in step 1f;" \
    "staging keeps its current data (empty on the first deployment)."
fi

# --- 3. Start ------------------------------------------------------------------------
env_set IMAGE_TAG "$tag"
env_set APP_VERSION_SUFFIX "$suffix"
if [ -n "$pull" ]; then compose pull --quiet; fi

if [ -n "$restore" ]; then
  echo "Restoring the database from BACKUP_DIR/$restore."
  compose stop app
  compose run --rm --no-deps --user root --entrypoint chown app node:node /backups
  compose run --rm --no-deps app zappaloo restore "/backups/$restore" --force
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
