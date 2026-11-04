#!/usr/bin/env bash
# Local image build (sw-architecture.md 23.1): version <last release>+local.<short commit>,
# image tag `local`, followed by the smoke test.
set -euo pipefail
cd "$(dirname "$0")/../.."

info=$(node scripts/version/cli.ts local)
version=$(node -e 'console.log(JSON.parse(process.argv[1]).version)' "$info")
commit=$(node -e 'console.log(JSON.parse(process.argv[1]).commit)' "$info")
image=ghcr.io/gravity981/zappaloo:local

if [ -n "$(git status --porcelain)" ]; then
  echo "Note: uncommitted changes are included; the commit label does not describe them." >&2
fi

docker build -f infrastructure/docker/Dockerfile \
  --build-arg APP_VERSION="$version" --build-arg APP_COMMIT="$commit" \
  -t "$image" .
infrastructure/scripts/smoke-test-image.sh "$image" "$version" "$commit"
