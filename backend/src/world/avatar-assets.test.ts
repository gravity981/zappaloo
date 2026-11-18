// Avatars come from prepared pixel-art assets (AVA-03): no AI API is used anywhere in the application.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MANIFESTS = [
  "package.json",
  "shared/package.json",
  "backend/package.json",
  "frontend/package.json",
  "game-engine/package.json",
  "game-preview/package.json",
  "theme-editor/package.json",
];
/** The client libraries of the common AI APIs. */
const AI_LIBRARIES =
  /anthropic|openai|generative-ai|genai|langchain|mistral|cohere|replicate|huggingface/i;

describe("avatar assets (AVA-03)", () => {
  it("[AVA-03] no workspace depends on a client library of an AI API; figures are prepared assets of the world package", () => {
    for (const manifest of MANIFESTS) {
      const parsed = JSON.parse(
        readFileSync(new URL(`../../../${manifest}`, import.meta.url), "utf8"),
      ) as Record<string, Record<string, string> | undefined>;
      const names = ["dependencies", "devDependencies", "optionalDependencies"].flatMap((key) =>
        Object.keys(parsed[key] ?? {}),
      );
      expect(
        names.filter((name) => AI_LIBRARIES.test(name)),
        manifest,
      ).toEqual([]);
    }
  });
});
