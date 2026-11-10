// Deployment test (test-strategy.md, "Deployment smoke"): runs the real bundle
// (compose.yaml, deploy.sh) with the real application image in Docker.
// Image: $ZAPPALOO_TEST_IMAGE, default ghcr.io/gravity981/zappaloo:local
// (infrastructure/scripts/build-image.sh). Run with `npm run test:deploy`.
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bundle = fileURLToPath(new URL(".", import.meta.url));
const REPOSITORY = "ghcr.io/gravity981/zappaloo";
// Staging is reached by the LAN IP address (sw-architecture.md 23.4); any IP works here.
const SITE_IP = "10.99.0.1";
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
  /** Caddy's ports, the same inside and outside its container. */
  httpPort: number;
  httpsPort: number;
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
    .replace(/^SITE_ADDRESS=.*$/m, `SITE_ADDRESS=${SITE_IP}`)
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
    httpPort: httpsPort - 1,
    httpsPort,
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

  it("[OPS-03] publishes only Caddy's HTTP and HTTPS ports and, on staging, Mailpit's web UI", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    const published = env
      .compose("ps", "--format", "json")
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as { Service: string; Publishers: { PublishedPort: number }[] | null },
      )
      .flatMap((c) =>
        (c.Publishers ?? [])
          .filter((p) => p.PublishedPort > 0)
          .map((p) => `${c.Service}:${p.PublishedPort}`),
      );
    const mailpitPort = env.httpsPort + 1;
    expect([...new Set(published)].sort()).toEqual(
      [`caddy:${env.httpPort}`, `caddy:${env.httpsPort}`, `mailpit:${mailpitPort}`].sort(),
    );
  });

  it("[OPS-01] Caddy serves the app over HTTPS at an IP address, like a browser without SNI", async () => {
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
      // Connecting to an IP address, Node (like a browser) sends no server name (SNI).
      // The certificate must chain to Caddy's root and be valid for the site's IP.
      `const https = require("node:https"), tls = require("node:tls"), dns = require("node:dns");
       const site = ${JSON.stringify(SITE_IP)};
       let ca = ""; process.stdin.on("data", (d) => (ca += d)).on("end", () => dns.lookup("caddy", (err, ip) => {
         if (err) { console.error(err.message); process.exit(1); }
         https.get({ host: ip, port: ${env.httpsPort}, path: "/api/health", headers: { host: site }, ca,
                     checkServerIdentity: (_host, cert) => tls.checkServerIdentity(site, cert) }, (res) => {
           let body = ""; res.on("data", (d) => (body += d)).on("end", () =>
             console.log(JSON.stringify({ status: res.statusCode, robots: res.headers["x-robots-tag"], body })));
         }).on("error", (e) => { console.error(e.message); process.exit(1); });
       }));`,
      root,
    );
    const parsed = JSON.parse(response) as { status: number; robots: string; body: string };
    expect(parsed.status).toBe(200);
    expect(parsed.robots).toContain("noindex");
    expect(JSON.parse(parsed.body)).toMatchObject({ status: "ok" });
  });

  it("[OPS-02] live updates (Server-Sent Events) pass through Caddy one by one, not buffered", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    // Three events one second apart, through Caddy over HTTPS with compression
    // negotiated, as a browser would. Each must arrive about when it is sent.
    const arrivals = env.node(
      `const https = require("node:https"), dns = require("node:dns"), zlib = require("node:zlib");
       dns.lookup("caddy", (_e, ip) => {
         const start = Date.now(), times = [];
         https.get({ host: ip, port: ${env.httpsPort}, path: "/api/events/ping?count=3&intervalMs=1000",
                     headers: { host: ${JSON.stringify(SITE_IP)}, accept: "text/event-stream",
                                "accept-encoding": "gzip, zstd" },
                     rejectUnauthorized: false }, (res) => {
           // Decompress like a browser; flush each chunk as it arrives.
           const encoding = res.headers["content-encoding"] ?? null;
           const decoded = encoding === "gzip" ? res.pipe(zlib.createGunzip({ finishFlush: zlib.constants.Z_SYNC_FLUSH }))
             : encoding === "zstd" ? res.pipe(zlib.createZstdDecompress()) : res;
           let text = "";
           decoded.on("data", (chunk) => {
             text += chunk;
             const found = (text.match(/event: ping/g) ?? []).length;
             while (times.length < found) times.push(Date.now() - start);
           });
           decoded.on("end", () => console.log(JSON.stringify({ status: res.statusCode,
             type: res.headers["content-type"], encoding, times })));
         });
       });`,
    );
    const result = JSON.parse(arrivals) as {
      status: number;
      type: string;
      encoding: string | null;
      times: number[];
    };
    expect(result.status).toBe(200);
    expect(result.type).toContain("text/event-stream");
    expect(result.times, JSON.stringify(result)).toHaveLength(3);
    const [first = 0, , last = 0] = result.times;
    // Unbuffered: the first event long before the last, about two seconds apart.
    expect(first).toBeLessThan(1700);
    expect(last - first).toBeGreaterThan(1500);
  });

  it("[OPS-01] redirects HTTP to HTTPS on the configured port (staging next to prod on one machine)", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    const answer = env.node(
      `const http = require("node:http"), dns = require("node:dns");
       dns.lookup("caddy", (_e, ip) => {
         http.get({ host: ip, port: ${env.httpPort}, path: "/game?x=1", headers: { host: ${JSON.stringify(SITE_IP)} } },
           (res) => {
             res.resume();
             console.log(JSON.stringify({ status: res.statusCode, location: res.headers.location }));
             process.exit(0);
           });
       });`,
    );
    expect(JSON.parse(answer), answer).toEqual({
      status: 308,
      location: `https://${SITE_IP}:${env.httpsPort}/game?x=1`,
    });
  });

  it("[OPS-01] answers any other host name with 421 and a clear message instead of an empty page", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    // E.g. a SITE_ADDRESS that does not match the address in the browser.
    const answers = env.node(
      `const https = require("node:https"), http = require("node:http"), dns = require("node:dns");
       const get = (proto, ip, port) => new Promise((resolve) =>
         proto.get({ host: ip, port, path: "/", headers: { host: "10.99.0.2" }, rejectUnauthorized: false },
           (res) => { let b = ""; res.on("data", (d) => (b += d)).on("end", () => resolve({ status: res.statusCode, body: b })); }));
       dns.lookup("caddy", async (_e, ip) => {
         console.log(JSON.stringify([await get(https, ip, ${env.httpsPort}), await get(http, ip, ${env.httpPort})]));
       });`,
    );
    const expected = {
      status: 421,
      body: `421 Misdirected Request: this server only answers to ${SITE_IP}`,
    };
    expect(JSON.parse(answers)).toEqual([expected, expected]);
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

describe("configuration changes", () => {
  it("[OPS-15] a changed Caddy configuration in a new bundle takes effect on the next deployment", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    // A new bundle with a changed Caddyfile (inline in compose.yaml).
    const composeFile = join(env.dir, "compose.yaml");
    writeFileSync(
      composeFile,
      readFileSync(composeFile, "utf8").replace(
        "        encode zstd gzip\n",
        "        encode zstd gzip\n        # changed-in-new-bundle\n",
      ),
    );
    expect(env.deploy(STAGING_TAG, "--no-pull").status).toBe(0);
    expect(env.compose("exec", "-T", "caddy", "cat", "/etc/caddy/Caddyfile")).toContain(
      "changed-in-new-bundle",
    );
  });
});

describe("staging with a prod backup", () => {
  const backupsDir = (env: Environment) => join(env.dir, "backups");

  it("[OPS-13][OPS-05] a deployment restores the latest full backup into a fresh staging volume", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    // A full backup as the operator would provide it: made from a running environment.
    sql(env, "CREATE TABLE IF NOT EXISTS visitors (name TEXT)");
    sql(env, "DELETE FROM visitors");
    sql(env, "INSERT INTO visitors VALUES ('Anna')");
    env.compose("exec", "-T", "app", "sh", "-c", "echo from-backup > /data/uploads/restore.jpg");
    mkdirSync(backupsDir(env), { recursive: true });
    const archive = join(backupsDir(env), "prod-backup.tar.gz");
    writeFileSync(
      archive,
      execFileSync(
        "docker",
        ["compose", "exec", "-T", "app", "zappaloo", "backup", "--full", "-"],
        {
          cwd: env.dir,
          env: { ...process.env, SESSION_SECRET: "x" },
          maxBuffer: 64 * 1024 * 1024,
        },
      ),
    );

    // The staging data has moved on; the deployment replaces it with the backup.
    sql(env, "DELETE FROM visitors");
    sql(env, "INSERT INTO visitors VALUES ('Mallory')");
    env.compose(
      "exec",
      "-T",
      "app",
      "sh",
      "-c",
      "rm /data/uploads/restore.jpg; echo x > /data/uploads/other.jpg",
    );

    const result = env.deploy(STAGING_TAG, "--no-pull");
    expect(result.output).toContain("with the full backup backups/prod-backup.tar.gz");
    expect(result.status).toBe(0);
    expect(JSON.parse(sql(env, "SELECT name FROM visitors"))).toEqual([{ name: "Anna" }]);
    expect(env.compose("exec", "-T", "app", "cat", "/data/uploads/restore.jpg").trim()).toBe(
      "from-backup",
    );
    expect(() => env.compose("exec", "-T", "app", "cat", "/data/uploads/other.jpg")).toThrow();
  });

  it("[OPS-13] --no-restore keeps the staging data", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    sql(env, "INSERT INTO visitors VALUES ('Ben')");
    expect(env.deploy(STAGING_TAG, "--no-pull", "--no-restore").status).toBe(0);
    expect(JSON.parse(sql(env, "SELECT name FROM visitors ORDER BY name"))).toEqual([
      { name: "Anna" },
      { name: "Ben" },
    ]);
  });

  it("[OPS-13] refuses to restore guest data unless staging's mail is caught", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    const envFile = join(env.dir, ".env");
    const original = readFileSync(envFile, "utf8");
    writeFileSync(envFile, original.replace(/^SMTP_HOST=.*$/m, "SMTP_HOST=smtp.example.com"));
    const result = env.deploy(STAGING_TAG, "--no-pull");
    writeFileSync(envFile, original);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("no mail reaches real recipients");
    // Nothing was touched.
    expect(JSON.parse(sql(env, "SELECT name FROM visitors ORDER BY name"))).toEqual([
      { name: "Anna" },
      { name: "Ben" },
    ]);
  });

  it("[OPS-13] --teardown stops staging and deletes its data volume, but not Caddy's CA", () => {
    const env = staging;
    if (!env) throw new Error("staging not deployed");
    const volumes = () => docker("volume", "ls", "--format", "{{.Name}}").split("\n");
    expect(volumes()).toContain(`${env.project}-data`);

    // Without confirmation nothing happens.
    const unconfirmed = env.deploy("--teardown");
    expect(unconfirmed.status).not.toBe(0);
    expect(unconfirmed.output).toContain("confirm with --yes");
    expect(volumes()).toContain(`${env.project}-data`);

    const result = env.deploy("--teardown", "--yes");
    expect(result.output).toContain("volume " + env.project + "-data deleted");
    expect(result.status).toBe(0);
    expect(volumes()).not.toContain(`${env.project}-data`);
    expect(volumes()).toContain(`${env.project}_caddy-data`);
    expect(env.compose("ps", "--quiet").trim()).toBe("");
  });
});

describe("private event", () => {
  it("[CFG-02] an event put into the data volume is used instead of the one in the image", () => {
    const env = createEnvironment("staging", 18443 + (process.pid % 500) * 3 + 3000);
    const envFile = join(env.dir, ".env");
    writeFileSync(
      envFile,
      readFileSync(envFile, "utf8").replace(/^EVENT_SLUG=.*$/m, "EVENT_SLUG=our-day"),
    );
    try {
      // As in the runbook: before the first deployment, with the image to deploy.
      const event = mkdtempSync(join(tmpdir(), "zappaloo-private-event-"));
      const eventJson = JSON.parse(
        execFileSync(
          "docker",
          ["run", "--rm", sourceImage, "cat", "/app/events/event-muster/event.json"],
          {
            encoding: "utf8",
          },
        ),
      ) as Record<string, unknown>;
      writeFileSync(
        join(event, "event.json"),
        JSON.stringify({ ...eventJson, id: "our-day", slug: "our-day", name: "Our Day" }),
      );
      writeFileSync(join(event, "theme.json"), "{}");
      // Docker runs outside the devcontainer, so no bind mount: the files go in as a tar stream.
      const files = execFileSync("tar", ["-cf", "-", "-C", event, "."]);
      execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "-i",
          "-v",
          `${env.project}-data:/data`,
          sourceImage,
          "sh",
          "-c",
          "mkdir -p /data/events/our-day && tar -xf - -C /data/events/our-day",
        ],
        { input: files },
      );
      rmSync(event, { recursive: true, force: true });

      const result = env.deploy(STAGING_TAG, "--no-pull", "--no-restore");
      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("healthy, version");
      const served = JSON.parse(
        env.node(
          `fetch("http://127.0.0.1:3000/api/event").then((r) => r.text()).then(console.log)`,
        ),
      ) as { id: string; name: string };
      expect(served).toMatchObject({ id: "our-day", name: "Our Day" });
      // Switched on and off at runtime with the CLI, as in the runbook.
      env.compose("exec", "-T", "app", "zappaloo", "event", "feature", "gallery", "off");
      expect(env.compose("exec", "-T", "app", "zappaloo", "event", "show")).toContain(
        "gallery: off",
      );
    } finally {
      destroy(env);
    }
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

    // Deleting data is for staging only.
    const teardown = prod.deploy("--teardown", "--yes");
    expect(teardown.status).not.toBe(0);
    expect(teardown.output).toContain("--teardown is only for staging");

    // A registry token without its user name is reported before anything is pulled.
    writeFileSync(join(prod.dir, "ghcr-token"), "token");
    const noUser = prod.deploy(RELEASE_TAG);
    rmSync(join(prod.dir, "ghcr-token"));
    expect(noUser.status).not.toBe(0);
    expect(noUser.output).toContain("GHCR_USER in .env is empty");
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
    const backup = /Backed up the database to backups\/(\S+\.db)\./.exec(second.output)?.[1];
    expect(backup).toMatch(
      new RegExp(`^\\d{8}T\\d{6}Z_${label(sourceImage).replace(/[.+]/g, "\\$&")}\\.db$`),
    );
    // On the host, owned by the user running deploy.sh, readable only by them, a SQLite file.
    const file = join(env.dir, "backups", backup ?? "");
    const stat = statSync(file);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(stat.uid).toBe(process.getuid?.());
    expect(readFileSync(file).subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
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
