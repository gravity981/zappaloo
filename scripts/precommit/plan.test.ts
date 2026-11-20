import { describe, expect, it } from "vitest";
import { planChecks } from "./plan.ts";

describe("the checks before a commit", () => {
  it("checks only the workspaces that contain a changed TypeScript file", () => {
    const plan = planChecks(["game-engine/src/GameScene.ts", "frontend/src/game/GameCanvas.tsx"]);
    expect(plan.typecheck).toEqual({ workspaces: ["frontend", "game-engine"], root: false });
  });

  it("checks every workspace when `shared` changes, because they use its types", () => {
    const plan = planChecks(["shared/src/world.ts"]);
    expect(plan.typecheck.workspaces).toHaveLength(6);
    expect(plan.typecheck.root).toBe(false);
  });

  it("checks the root project for scripts, end-to-end tests and configuration", () => {
    expect(planChecks(["scripts/ci/select-e2e.ts"]).typecheck).toEqual({
      workspaces: [],
      root: true,
    });
    expect(planChecks(["e2e/game-world.spec.ts"]).typecheck.root).toBe(true);
    expect(planChecks(["playwright.config.ts"]).typecheck.root).toBe(true);
  });

  it("does not run tsc for documents, JSON and workflows", () => {
    const plan = planChecks([
      "spec/test-strategy.md",
      "e2e/relevant.json",
      ".github/workflows/ci.yml",
    ]);
    expect(plan.typecheck).toEqual({ workspaces: [], root: false });
    expect(plan.lint).toEqual([]);
    expect(plan.related).toEqual([]);
  });

  it("lints scripts and sources, formats every changed file, relates sources and tests", () => {
    const plan = planChecks(["backend/src/rsvp/service.ts", "eslint.config.js", "CLAUDE.md"]);
    expect(plan.lint).toEqual(["backend/src/rsvp/service.ts", "eslint.config.js"]);
    expect(plan.format).toHaveLength(3);
    expect(plan.related).toEqual(["backend/src/rsvp/service.ts"]);
  });
});
