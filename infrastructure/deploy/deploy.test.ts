// Deployment test (test-strategy.md, "Deployment smoke"): runs the real bundle
// (compose.yaml, deploy.sh) with the real application image in Docker.
// Image: $ZAPPALOO_TEST_IMAGE, default ghcr.io/gravity981/zappaloo:local
// (infrastructure/scripts/build-image.sh). Run with `npm run test:deploy`.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bundle = fileURLToPath(new URL(".", import.meta.url));
const REPOSITORY = "ghcr.io/gravity981/zappaloo";
const sourceImage = process.env.ZAPPALOO_TEST_IMAGE ?? `${REPOSITORY}:local`;
const run = `t${process.pid}`;
// Tags only used by this test: a staging tag, and two prod release tags.
const STAGING_TAG = `test-${run}`;
const patch = 9000 + (process.pid % 900);
const RELEASE_TAG = `0.0.${patch}`;
const BROKEN_TAG = `0.0.${patch + 1}`;
const label = (image: string) =>
  docker(
    "image",
    "inspect",
    "--format",
    '{{ index .Config.Labels "org.opencontainers.image.version" }}',
    image,
  ).trim();

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

interface Environment {
  dir: string;
  project: string;
  deploy: (...args: string[]) => { status: number; output: string };
  compose: (...args: string[]) => string;
  /** Runs a Node.js snippet inside the app container; returns its stdout. */
  node: (script: string, input?: string) => string;
}

function createEnvironment(target: "staging" | "prod", httpsPort: number): Environment {
  const dir = mkdtempSync(join(tmpdir(), `zappaloo-deploy-${target}-`));
  const project = `zappaloo-test-${target}-${run}`;
  copyFileSync(join(bundle, "compose.yaml"), join(dir, "compose.yaml"));
  copyFileSync(join(bundle, "deploy.sh"), join(dir, "deploy.sh"));
  const env = readFileSync(join(bundle, ".env.example"), "utf8")
    .replace(/^APP_ENV=.*$/m, `APP_ENV=${target}`)
    .replace(/^COMPOSE_PROJECT_NAME=.*$/m, `COMPOSE_PROJECT_NAME=${project}`)
    .replace(/^DATA_VOLUME=.*$/m, `DATA_VOLUME=${project}-data`)
    .replace(/^SITE_ADDRESS=.*$/m, "SITE_ADDRESS=localhost")
    .replace(/^HTTP_PORT=.*$/m, `HTTP_PORT=${httpsPort - 1}`)
    .replace(/^HTTPS_PORT=.*$/m, `HTTPS_PORT=${httpsPort}`)
    .replace(/^MAILPIT_UI_PORT=.*$/m, `MAILPIT_UI_PORT=${httpsPort + 1}`)
    .replace(/^COMPOSE_PROFILES=.*$/m, `COMPOSE_PROFILES=${target === "staging" ? "mailpit" : ""}`);
  writeFileSync(join(dir, ".env"), env);

  const compose = (...args: string[]) =>
    execFileSync("docker", ["compose", ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, SESSION_SECRET: "unused-for-exec" },
      stdio: ["pipe", "pipe", "pipe"],
    });
  return {
    dir,
    project,
    deploy: (...args) => {
      const result = spawnSync(join(dir, "deploy.sh"), [target, ...args], {
        encoding: "utf8",
        env: { DEPLOY_HEALTH_TIMEOUT: "60", ...process.env },
      });
      return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
    },
    compose,
    node: (script, input) =>
      execFileSync("docker", ["compose", "exec", "-T", "app", "node", "-e", script], {
        cwd: dir,
        encoding: "utf8",
        input,
        env: { ...process.env, SESSION_SECRET: "unused-for-exec" },
      }),
  };
}

function destroy(environment: Environment | undefined): void {
  if (!environment) return;
  spawnSync("docker", ["compose", "down", "--volumes", "--remove-orphans"], {
    cwd: environment.dir,
    env: { ...process.env, SESSION_SECRET: "x", IMAGE_TAG: "x" },
  });
  spawnSync("docker", ["volume", "rm", "-f", `${environment.project}-data`]);
  rmSync(environment.dir, { recursive: true, force: true });
}

/** SQL against the app's database, run with the app's own SQLite driver. */
const sql = (environment: Environment, statement: string): string =>
  environment.node(
    `const S = require("/app/node_modules/better-sqlite3");
     const db = new S("/data/zappaloo.db");
     const s = db.prepare(${JSON.stringify(statement)});
     console.log(JSON.stringify(s.reader ? s.all() : s.run()));`,
  );

let staging: Environment | undefined;
let prod: Environment | undefined;

beforeAll(() => {
  docker("image", "inspect", sourceImage);
  docker("tag", sourceImage, `${REPOSITORY}:${STAGING_TAG}`);
  docker("tag", sourceImage, `${REPOSITORY}:${RELEASE_TAG}`);
  // A release whose app never becomes healthy, with the same version label.
  execFileSync("docker", ["build", "-t", `${REPOSITORY}:${BROKEN_TAG}`, "-"], {
    input: `FROM ${sourceImage}\nCMD ["node", "-e", "process.exit(1)"]\n`,
    stdio: ["pipe", "ignore", "pipe"],
  });
});

afterAll(() => {
  destroy(staging);
  destroy(prod);
  for (const tag of [STAGING_TAG, RELEASE_TAG, BROKEN_TAG]) {
    spawnSync("docker", ["image", "rm", "-f", `${REPOSITORY}:${tag}`]);
  }
});

describe("staging deployment", () => {
  it("[OPS-15][OPS-01] deploys to staging without a prod release or backup, starting with an empty database", () => {
    staging = createEnvironment("staging", 18443 + (process.pid % 500) * 3);
    const result = staging.deploy(STAGING_TAG, "--no-pull");
    expect(result.output).toContain("staging keeps its current data");
    expect(result.output).toContain(`healthy, version ${label(sourceImage)}`);
    expect(result.status).toBe(0);

    const env = readFileSync(join(staging.dir, ".env"), "utf8");
    expect(env).toMatch(new RegExp(`^IMAGE_TAG=${STAGING_TAG}$`, "m"));
    expect(env).not.toContain("SESSION_SECRET");
    expect(statSync(join(staging.dir, "secrets", "session_secret")).mode & 0o777).toBe(0o600);
    // Only Caddy (and Mailpit on staging) publish ports; the app does not.
    // "docker compose port" prints ":0" (or nothing) for a port that is not published.
    expect(["", ":0"]).toContain(staging.compose("port", "app", "3000").trim());
  });

  it("[OPS-01] Caddy serves the app over HTTPS with a certificate from its local CA", async () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    // Trust only Caddy's root certificate, as a test device would after installing it.
    let root = "";
    for (let i = 0; i < 30 && !root.includes("BEGIN CERTIFICATE"); i++) {
      root = spawnSync(
        "docker",
        ["compose", "exec", "-T", "caddy", "cat", "/data/caddy/pki/authorities/local/root.crt"],
        {
          cwd: env.dir,
          encoding: "utf8",
          env: { ...process.env, SESSION_SECRET: "x" },
        },
      ).stdout;
      if (!root.includes("BEGIN CERTIFICATE")) await new Promise((r) => setTimeout(r, 1000));
    }
    expect(root).toContain("BEGIN CERTIFICATE");

    const response = env.node(
      `const https = require("node:https");
       let ca = ""; process.stdin.on("data", (d) => (ca += d)).on("end", () => {
         https.get({ host: "caddy", port: 443, path: "/api/health", servername: "localhost",
                     headers: { host: "localhost" }, ca }, (res) => {
           let body = ""; res.on("data", (d) => (body += d)).on("end", () =>
             console.log(JSON.stringify({ status: res.statusCode, robots: res.headers["x-robots-tag"], body })));
         }).on("error", (e) => { console.error(e.message); process.exit(1); });
       });`,
      root,
    );
    const parsed = JSON.parse(response) as { status: number; robots: string; body: string };
    expect(parsed.status).toBe(200);
    expect(parsed.robots).toContain("noindex");
    expect(JSON.parse(parsed.body)).toMatchObject({ status: "ok" });
  });

  it("[OPS-04] data survives redeployments and a full restart of the stack", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    sql(env, "CREATE TABLE IF NOT EXISTS marker (value TEXT)");
    sql(env, "INSERT INTO marker VALUES ('kept')");
    env.compose("exec", "-T", "app", "sh", "-c", "echo photo > /data/uploads/marker.jpg");

    expect(env.deploy(STAGING_TAG, "--no-pull").status).toBe(0);
    env.compose("down");
    expect(env.deploy(STAGING_TAG, "--no-pull").status).toBe(0);

    expect(JSON.parse(sql(env, "SELECT value FROM marker"))).toEqual([{ value: "kept" }]);
    expect(env.compose("exec", "-T", "app", "cat", "/data/uploads/marker.jpg").trim()).toBe(
      "photo",
    );
  });
});

describe("prod deployment", () => {
  it("[OPS-15] prod accepts only release tags, and each directory only its own environment", () => {
    prod = createEnvironment("prod", 18443 + (process.pid % 500) * 3 + 1500);
    for (const tag of [STAGING_TAG, `${RELEASE_TAG}-rc.1`, "latest"]) {
      const result = prod.deploy(tag, "--no-pull");
      expect(result.status, tag).not.toBe(0);
      expect(result.output, tag).toMatch(/only release image tags|never deployed/);
    }
    const wrongDirectory = spawnSync(
      join(prod.dir, "deploy.sh"),
      ["staging", STAGING_TAG, "--no-pull"],
      {
        encoding: "utf8",
      },
    );
    expect(wrongDirectory.status).not.toBe(0);
    expect(wrongDirectory.stderr).toContain("this directory is for APP_ENV=prod");
  });

  it("[OPS-15] backs up the prod database before each deployment", () => {
    const env = prod;
    if (!env) throw new Error("prod not set up");
    const first = env.deploy(RELEASE_TAG, "--no-pull");
    expect(first.output).toContain("no backup before this deployment (first deployment?)");
    expect(first.status).toBe(0);

    sql(env, "CREATE TABLE guests (name TEXT)");
    sql(env, "INSERT INTO guests VALUES ('Anna')");
    const second = env.deploy(RELEASE_TAG, "--no-pull");
    expect(second.status).toBe(0);
    const backup = /Backed up the database to BACKUP_DIR\/(\S+\.db)\./.exec(second.output)?.[1];
    expect(backup).toMatch(
      new RegExp(`^\\d{8}T\\d{6}Z_${label(sourceImage).replace(/[.+]/g, "\\$&")}\\.db$`),
    );
    expect(env.compose("exec", "-T", "app", "ls", "/backups")).toContain(backup);
  });

  it("[OPS-15][OPS-16] a failed deployment reports the rollback, which restores image and database", () => {
    const env = prod;
    if (!env) throw new Error("prod not set up");
    sql(env, "DELETE FROM guests");
    sql(env, "INSERT INTO guests VALUES ('Ben')");

    // A short wait is enough: this app never becomes healthy.
    process.env.DEPLOY_HEALTH_TIMEOUT = "15";
    const failed = env.deploy(BROKEN_TAG, "--no-pull");
    delete process.env.DEPLOY_HEALTH_TIMEOUT;
    expect(failed.status).not.toBe(0);
    expect(failed.output).toContain("DEPLOYMENT FAILED");
    const rollback = /Roll back with: \S*deploy\.sh prod (\S+) --restore (\S+)/.exec(failed.output);
    expect(rollback?.[1]).toBe(RELEASE_TAG);
    const backup = rollback?.[2] ?? "";

    const restored = env.deploy(RELEASE_TAG, "--restore", backup, "--no-pull");
    expect(restored.output).toContain(`healthy, version ${label(sourceImage)}`);
    expect(restored.status).toBe(0);
    // The database is the one from just before the failed deployment.
    expect(JSON.parse(sql(env, "SELECT name FROM guests"))).toEqual([{ name: "Ben" }]);
  });
});
