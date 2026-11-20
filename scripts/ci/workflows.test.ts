// Checks the GitHub Actions workflows and the Dockerfile against the CI rules
// of sw-architecture.md 23.2 and 23.6. They run on GitHub; these tests keep their
// structure from drifting away from the spec.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  uses?: string;
  permissions?: Record<string, string>;
  container?: { image?: string };
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const ci = parse(read(".github/workflows/ci.yml")) as Workflow;
const cleanup = parse(read(".github/workflows/cleanup-images.yml")) as Workflow;
const candidateWorkflow = parse(read(".github/workflows/release-candidate.yml")) as Workflow;
const nightly = parse(read(".github/workflows/nightly.yml")) as Workflow;
const promoteWorkflow = parse(read(".github/workflows/promote.yml")) as Workflow;
const dockerfile = read("infrastructure/docker/Dockerfile");
const packageJson = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

function runs(job: Job | undefined): string[] {
  return (job?.steps ?? []).flatMap((step) => (step.run ? [step.run] : []));
}

/** Index of the first step whose command contains `text`, or -1. */
function stepIndex(job: Job | undefined, text: string): number {
  return (job?.steps ?? []).findIndex((step) => step.run?.includes(text));
}

describe("ci.yml", () => {
  const checks = ci.jobs.checks;
  const e2e = ci.jobs.e2e;
  const image = ci.jobs.image;
  const report = ci.jobs.report;

  it("[OPS-06] runs on every pull request and every push to main", () => {
    expect(ci.on).toHaveProperty("pull_request");
    expect(ci.on.push).toEqual({ branches: ["main"] });
  });

  it("[OPS-06] runs lint, type checks, build, all unit tests, the e2e tests and, in a full run, the requirement report", () => {
    for (const command of [
      "npm ci",
      "npm run lint",
      "npm run format:check",
      "npm run typecheck",
      "npm run migration-check",
      "npm run build",
      "npm test",
    ]) {
      expect(runs(checks), command).toContain(command);
    }
    expect(runs(e2e)).toContain("npm ci");
    expect(runs(image)).toContain("npm run test:deploy");
    // The report reads the results of all jobs, and runs even when tests failed, but only in a full run: a pull
    // request does not run every end-to-end test, so the report would show them as untested.
    expect(report?.needs).toEqual(["checks", "e2e", "image"]);
    expect(report?.if).toBe("${{ inputs.full && !cancelled() }}");
    expect(runs(report)).toContain("npm run req-report");
  });

  it("[OPS-06] a pull request runs the relevant e2e specs and the smoke set in Chromium, a full run everything", () => {
    const steps = e2e?.steps ?? [];
    const all = steps.find((step) => step.run === "npm run test:e2e");
    expect(all?.if).toBe("${{ inputs.full }}");
    const select = steps.find((step) => step.run?.includes("scripts/ci/select-e2e.ts"));
    expect(select?.if).toBe("${{ !inputs.full }}");
    const relevant = steps.find(
      (step) => step.run?.includes("playwright test") && !step.run.includes("@smoke"),
    );
    expect(relevant?.run).toContain("--project=desktop-chromium --project=game");
    expect(relevant?.if).toContain("!inputs.full");
    const smoke = steps.find((step) => step.run?.includes("--grep @smoke"));
    expect(smoke?.run).toContain("--project=desktop-chromium --project=game");
    // The smoke set also runs when the relevant specs failed, so that both results are known.
    expect(smoke?.if).toContain("!cancelled()");
    expect(ci.on).toHaveProperty("workflow_call.inputs.full.default", false);
  });

  it("runs the end-to-end tests in Playwright's official image of the installed Playwright version", () => {
    const version = packageJson.devDependencies["@playwright/test"];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(e2e?.container?.image).toBe(`mcr.microsoft.com/playwright:v${version}-noble`);
    // Browsers come with the image: nothing is installed at run time.
    expect(runs(e2e).join("\n")).not.toContain("playwright install");
  });

  it("[OPS-06] every npm script used by CI exists", () => {
    for (const command of Object.values(ci.jobs).flatMap(runs)) {
      const script = /^npm run ([\w:-]+)/.exec(command)?.[1];
      if (script) expect(packageJson.scripts, script).toHaveProperty(script);
    }
  });

  it("[OPS-06] pins every action to a full commit", () => {
    for (const workflow of [ci, cleanup, candidateWorkflow, promoteWorkflow]) {
      for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps ?? []) {
          if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
        }
      }
    }
  });

  it("[OPS-08] builds the image with the CI version, smoke-tests it, and pushes only from main after all checks", () => {
    expect(image?.needs).toEqual(["checks", "e2e"]);
    const all = runs(image).join("\n");
    expect(all).toContain("node scripts/version/cli.ts ci --run-number");
    expect(all).toContain("github.run_number");
    const buildIndex = (image?.steps ?? []).findIndex((s) =>
      s.uses?.startsWith("docker/build-push-action@"),
    );
    const build = image?.steps?.[buildIndex]?.with ?? {};
    expect(build.file).toBe("infrastructure/docker/Dockerfile");
    expect(build["build-args"]).toBe(
      "APP_VERSION=${{ steps.version.outputs.version }}\nAPP_COMMIT=${{ steps.version.outputs.commit }}\n",
    );
    expect(build.tags).toBe("${{ env.IMAGE }}:${{ steps.version.outputs.image_tag }}");
    expect(build.load).toBe(true);
    expect(build.push).toBe(false);
    // Layer cache in the GitHub Actions cache.
    expect(build["cache-from"]).toBe("type=gha");
    expect(build["cache-to"]).toBe("type=gha,mode=max");
    expect(stepIndex(image, "smoke-test-image.sh")).toBeGreaterThan(buildIndex);

    // The deployment test uses exactly the image that was built.
    const deployTest = image?.steps?.find((step) => step.run === "npm run test:deploy");
    expect(deployTest?.env?.ZAPPALOO_TEST_IMAGE).toBe(
      "${{ env.IMAGE }}:${{ steps.version.outputs.image_tag }}",
    );
    expect(stepIndex(image, "npm run test:deploy")).toBeGreaterThan(
      stepIndex(image, "smoke-test-image.sh"),
    );

    const push = image?.steps?.find((step) => step.run?.includes("docker push"));
    expect(push?.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(push?.run).toContain('"$IMAGE:${{ steps.version.outputs.image_tag }}"');
    expect(push?.run).toContain('"$IMAGE:main"');
    expect(stepIndex(image, "docker push")).toBeGreaterThan(
      stepIndex(image, "npm run test:deploy"),
    );
  });
});

describe("release-candidate.yml", () => {
  const jobs = candidateWorkflow.jobs;
  const all = (job?: Job) => (job?.steps ?? []).map((step) => JSON.stringify(step)).join("\n");

  it("[OPS-10] is started manually with the version, only from main and only after CI passed", () => {
    expect(candidateWorkflow.on).toHaveProperty("workflow_dispatch.inputs.version.required", true);
    expect(Object.keys(candidateWorkflow.on)).toEqual(["workflow_dispatch"]);
    const prepare = all(jobs.prepare);
    expect(prepare).toContain("github.ref != 'refs/heads/main'");
    expect(prepare).toContain("gh run list --workflow ci.yml --commit");
    expect(prepare).toContain("node scripts/release/cli.ts candidate");
  });

  it("[OPS-10] runs the full test suite before building, pushing and tagging the candidate", () => {
    expect(jobs.tests?.uses).toBe("./.github/workflows/ci.yml");
    // The candidate gets every end-to-end test in every browser and the requirement report (OPS-20).
    expect(jobs.tests).toHaveProperty("with.full", true);
    expect(ci.on).toHaveProperty("workflow_call");
    expect(jobs.release?.needs).toEqual(["prepare", "tests"]);
    const release = jobs.release;
    const build = release?.steps?.find((step) =>
      step.uses?.startsWith("docker/build-push-action@"),
    );
    // The image carries the version without the -rc.M suffix.
    expect(build?.with?.["build-args"]).toBe(
      "APP_VERSION=${{ needs.prepare.outputs.version }}\nAPP_COMMIT=${{ github.sha }}\n",
    );
    const steps = all(release);
    const order = ["smoke-test-image.sh", "docker push", "gh release create"].map((text) =>
      steps.indexOf(text),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(steps).toContain("--prerelease");
    // The bundle and the generated notes (changelog, install and update commands).
    expect(steps).toContain("scripts/release/cli.ts bundle");
    expect(steps).toContain("scripts/release/cli.ts notes");
    expect(steps).toContain("--notes-file notes.md");
    expect(steps).not.toContain("--generate-notes");
  });

  it("[OPS-10][OPS-12] makes the tag last, with the pre-release, so that a failed run does not use up the number", () => {
    const steps = jobs.release?.steps ?? [];
    // No step makes or deletes a tag by itself: tags `v*` can't be deleted (OPS-12), so a tag that exists is used up.
    expect(steps.some((step) => /git (tag|push)/.test(step.run ?? ""))).toBe(false);
    const create = steps.findIndex((step) => step.run?.includes("gh release create"));
    expect(create).toBe(steps.length - 1);
    expect(steps[create]?.run).toContain('--target "$GITHUB_SHA"');
    expect(steps[create]?.run).not.toContain("--verify-tag");
    // Everything the pre-release needs is made before the image is pushed.
    const prepared = steps.findIndex((step) => step.run?.includes("scripts/release/cli.ts bundle"));
    const pushed = steps.findIndex((step) => step.run?.includes("docker push"));
    expect(prepared).toBeGreaterThanOrEqual(0);
    expect(prepared).toBeLessThan(pushed);
    expect(pushed).toBeLessThan(create);
  });
});

describe("nightly.yml", () => {
  const text = read(".github/workflows/nightly.yml");

  it("[OPS-20] runs every night and by hand, only on main", () => {
    expect(nightly.on).toHaveProperty("schedule");
    expect(nightly.on).toHaveProperty("workflow_dispatch.inputs.force");
    expect(text).toContain("github.ref != 'refs/heads/main'");
  });

  it("[OPS-20] runs the full suite only when main has changed since the last nightly run", () => {
    const changed = nightly.jobs.changed;
    expect(JSON.stringify(changed?.steps)).toContain("gh run list");
    expect(JSON.stringify(changed?.steps)).toContain("nightly.yml");
    const tests = nightly.jobs.tests;
    expect(tests?.needs).toBe("changed");
    expect(tests?.if).toBe("${{ needs.changed.outputs.run == 'true' }}");
    expect(tests?.uses).toBe("./.github/workflows/ci.yml");
    expect(tests).toHaveProperty("with.full", true);
    // The called workflow pushes images and reads packages.
    expect(tests?.permissions).toMatchObject({ contents: "read", packages: "write" });
  });
});

describe("promote.yml", () => {
  const steps = (promoteWorkflow.jobs.promote?.steps ?? [])
    .map((step) => JSON.stringify(step))
    .join("\n");

  it("[OPS-11] promotes a candidate without rebuilding: release tag, image tags, GitHub release", () => {
    expect(promoteWorkflow.on).toHaveProperty("workflow_dispatch.inputs.candidate.required", true);
    expect(steps).toContain("node scripts/release/cli.ts promote");
    expect(steps).not.toContain("docker/build-push-action");
    expect(steps).not.toMatch(/docker (buildx )?build /);
    expect(steps).toContain("docker buildx imagetools create");
    expect(steps).toContain('git tag --annotate \\"$TAG\\"');
    expect(steps).toContain("--latest");
    // The bundle is taken from the candidate's commit; the notes are generated, not GitHub's.
    expect(steps).toContain('scripts/release/cli.ts bundle \\"$TAG\\" dist --ref \\"$commit\\"');
    expect(steps).toContain("scripts/release/cli.ts notes");
    expect(steps).toContain("--notes-file notes.md");
    expect(steps).not.toContain("--generate-notes");
  });
});

describe("release workflows", () => {
  it("[OPS-10][OPS-11] never put user input directly into shell commands (no script injection)", () => {
    for (const workflow of [candidateWorkflow, promoteWorkflow]) {
      for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps ?? []) {
          expect(step.run ?? "").not.toMatch(/\$\{\{\s*(inputs|github\.event)\./);
        }
      }
    }
  });
});

describe("Dockerfile", () => {
  it("[OPS-08] bakes version and commit into the image once: environment, /app/VERSION and OCI labels", () => {
    expect(dockerfile).toMatch(/^ARG APP_VERSION$/m);
    expect(dockerfile).toMatch(/APP_VERSION=\$\{APP_VERSION\}/);
    expect(dockerfile).toMatch(/APP_COMMIT=\$\{APP_COMMIT\}/);
    expect(dockerfile).toContain('echo "${APP_VERSION}" > /app/VERSION');
    expect(dockerfile).toContain('org.opencontainers.image.version="${APP_VERSION}"');
    expect(dockerfile).toContain('org.opencontainers.image.revision="${APP_COMMIT}"');
    // The frontend is built in the same image build with the same version.
    expect(dockerfile).toContain('APP_VERSION="$APP_VERSION" npm run build -w frontend');
  });

  it("[OPS-17] provides the zappaloo command inside the container", () => {
    expect(dockerfile).toContain("/usr/local/bin/zappaloo");
    expect(read("infrastructure/docker/zappaloo")).toContain("node /app/backend/src/cli.ts");
  });
});

describe("Node.js version", () => {
  it("is the same in CI, the image and the devcontainer", () => {
    const version = read(".node-version").trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dockerfile).toContain(`ARG NODE_IMAGE=node:${version}-`);
    expect(read(".devcontainer/Dockerfile")).toContain(`ARG NODE_VERSION=${version}`);
  });
});

describe("cleanup-images.yml", () => {
  it("[OPS-14] runs weekly and deletes old build images with the package token", () => {
    expect(cleanup.on).toHaveProperty("schedule");
    expect(cleanup.on).toHaveProperty("workflow_dispatch");
    const job = cleanup.jobs.cleanup;
    expect(runs(job).join("\n")).toContain("node scripts/cleanup-images/cli.ts");
    expect(read(".github/workflows/cleanup-images.yml")).toMatch(/packages: write/);
  });
});
