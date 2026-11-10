// Reading and validating an event's bootstrap directory (CFG-02,
// sw-architecture.md 19.3.1): `events/<slug>/event.json` and `theme.json`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eventConfigSchema, eventSlugSchema } from "@zappaloo/shared";
import type { EventConfig } from "@zappaloo/shared";

export class EventConfigError extends Error {
  override name = "EventConfigError";
}

export interface LoadedEvent {
  config: EventConfig;
  /** Parsed theme.json (a JSON object; its fields are specified with the website). */
  theme: Record<string, unknown>;
  /** The directory it was read from. */
  dir: string;
}

function readJson(file: string, problems: string[]): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    problems.push(`${file}: file is missing or not readable`);
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    problems.push(`${file}: not valid JSON (${error instanceof Error ? error.message : "?"})`);
    return undefined;
  }
}

/**
 * Finds the event `slug` in the first of `roots` that has a directory of that
 * name and validates it. Throws one EventConfigError listing every problem.
 */
export function loadEvent(slug: string, roots: string[]): LoadedEvent {
  const slugCheck = eventSlugSchema.safeParse(slug);
  if (!slugCheck.success) {
    throw new EventConfigError(
      `invalid event configuration: EVENT_SLUG "${slug}" ${slugCheck.error.issues[0]?.message ?? "is invalid"}`,
    );
  }
  const dir = roots.map((root) => join(root, slug)).find((candidate) => existsSync(candidate));
  if (!dir) {
    throw new EventConfigError(
      `invalid event configuration: no directory for the event "${slug}"; looked in ${roots.join(", ")}`,
    );
  }

  const problems: string[] = [];
  const eventFile = join(dir, "event.json");
  const raw = readJson(eventFile, problems);
  const parsed = raw === undefined ? undefined : eventConfigSchema.safeParse(raw);
  if (parsed && !parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      const detail =
        issue.code === "unrecognized_keys"
          ? `unknown key ${issue.keys.map((key) => `"${key}"`).join(", ")}`
          : issue.message;
      problems.push(`${eventFile}: ${path ? `${path}: ` : ""}${detail}`);
    }
  }
  const config = parsed?.success ? parsed.data : undefined;
  if (config && config.slug !== slug) {
    problems.push(`${eventFile}: slug "${config.slug}" must be the name of its folder "${slug}"`);
  }

  let theme: Record<string, unknown> = {};
  if (config) {
    const themeFile = join(dir, config.theme.config);
    const rawTheme = readJson(themeFile, problems);
    if (rawTheme !== undefined) {
      if (typeof rawTheme === "object" && rawTheme !== null && !Array.isArray(rawTheme)) {
        theme = rawTheme as Record<string, unknown>;
      } else {
        problems.push(`${themeFile}: must be a JSON object`);
      }
    }
  }

  if (problems.length > 0 || !config) {
    throw new EventConfigError(
      `invalid event configuration in ${dir}:\n  ${problems.join("\n  ")}`,
    );
  }
  return { config, theme, dir };
}
