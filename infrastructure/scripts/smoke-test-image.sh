#!/usr/bin/env bash
# Smoke test of an application image (OPS-08): starts it with an empty data
# directory and checks that it reports the expected version and commit.
#   smoke-test-image.sh <image> <expected version> [<expected commit>]
# Requests are made from inside the container, so the test needs no published
# port (works with Docker-outside-of-Docker in the devcontainer, too).
set -euo pipefail

image=${1:?image}
expected_version=${2:?expected version}
expected_commit=${3:-}
name="zappaloo-smoke-$$"

fail() {
  echo "SMOKE TEST FAILED: $*" >&2
  docker logs "$name" >&2 2>/dev/null || true
  exit 1
}
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# GET a path of the running app from inside the container; prints the body.
get() {
  docker exec "$name" node -e '
    fetch("http://127.0.0.1:3000" + process.argv[1])
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); process.stdout.write(await r.text()); })
      .catch((e) => { console.error(e.message); process.exit(1); });
  ' "$1"
}

label=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$image")
[ "$label" = "$expected_version" ] || fail "image label version is '$label', expected '$expected_version'"

cli=$(docker run --rm "$image" zappaloo version)
[ "${cli%% *}" = "$expected_version" ] || fail "'zappaloo version' printed '$cli'"

docker run -d --name "$name" "$image" >/dev/null

for _ in $(seq 1 30); do
  if get /api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
health=$(get /api/health) || fail "/api/health not reachable"
version_json=$(get /api/version) || fail "/api/version not reachable"

node -e '
  const [health, version, expectedVersion, expectedCommit] = process.argv.slice(1);
  const h = JSON.parse(health), v = JSON.parse(version);
  const errors = [];
  if (h.status !== "ok") errors.push(`health status ${h.status}`);
  if (h.version !== expectedVersion) errors.push(`health version ${h.version}`);
  if (v.version !== expectedVersion) errors.push(`/api/version ${v.version}`);
  if (expectedCommit && v.commit !== expectedCommit) errors.push(`commit ${v.commit}`);
  if (errors.length) { console.error(errors.join(", ")); process.exit(1); }
' "$health" "$version_json" "$expected_version" "$expected_commit" || fail "expected version $expected_version"

page=$(get /) || fail "frontend not served"
grep -q '<div id="root">' <<<"$page" || fail "frontend index.html not served"
[ "$(docker exec "$name" cat /app/VERSION)" = "$expected_version" ] || fail "/app/VERSION differs"

echo "Smoke test passed: $image reports $expected_version"
