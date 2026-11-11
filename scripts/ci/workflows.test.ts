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

  it("[OPS-06] runs lint, type checks, build, all tests and the requirement report", () => {
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
    expect(runs(e2e)).toContain("npm run test:e2e");
    expect(runs(image)).toContain("npm run test:deploy");
    // The report reads the results of all jobs, and runs even when tests failed.
    expect(report?.needs).toEqual(["checks", "e2e", "image"]);
    expect(report?.if).toBe("${{ !cancelled() }}");
    expect(runs(report)).toContain("npm run req-report");
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
    const order = [
      "smoke-test-image.sh",
      "docker push",
      "git push origin",
      "gh release create",
    ].map((text) => steps.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(steps).toContain("--prerelease");
    // The bundle and the generated notes (changelog, install and update commands).
    expect(steps).toContain("scripts/release/cli.ts bundle");
    expect(steps).toContain("scripts/release/cli.ts notes");
    expect(steps).toContain("--notes-file notes.md");
    expect(steps).not.toContain("--generate-notes");
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
