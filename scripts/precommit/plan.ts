// What the checks before a commit run on (spec/test-strategy.md 8.2): only the changed files, and the parts of the
// repository they belong to. The commands are in cli.ts; this is the choice, which a test can check.

/** The workspaces with their own `typecheck` script. */
export const WORKSPACES = [
  "shared",
  "backend",
  "frontend",
  "game-engine",
  "game-preview",
  "theme-editor",
] as const;

export type Workspace = (typeof WORKSPACES)[number];

export interface Plan {
  /** Files that Prettier checks (it skips the types it does not know and what .prettierignore lists). */
  format: string[];
  /** Files that ESLint checks. */
  lint: string[];
  /** The workspaces `tsc` runs in, and whether it runs for the root project (scripts, e2e, configurations). */
  typecheck: { workspaces: Workspace[]; root: boolean };
  /** Source and test files whose related unit tests run. */
  related: string[];
}

const LINTED = /\.(ts|tsx|js|mjs|cjs)$/;
const TYPED = /\.(ts|tsx)$|(^|\/)tsconfig[^/]*\.json$/;

function workspaceOf(file: string): Workspace | undefined {
  return WORKSPACES.find((name) => file.startsWith(`${name}/`));
}

/** The plan for the changed files (the paths of files that still exist, from the repository root). */
export function planChecks(files: readonly string[]): Plan {
  const typed = files.filter((file) => TYPED.test(file));
  // The other workspaces use the types of `shared`, so a change there is checked everywhere.
  const sharedChanged = typed.some((file) => file.startsWith("shared/"));
  const workspaces = sharedChanged
    ? [...WORKSPACES]
    : WORKSPACES.filter((name) => typed.some((file) => workspaceOf(file) === name));
  const root = typed.some((file) => workspaceOf(file) === undefined);
  return {
    format: [...files],
    lint: files.filter((file) => LINTED.test(file)),
    typecheck: { workspaces, root },
    related: files.filter((file) => /\.(ts|tsx)$/.test(file)),
  };
}
