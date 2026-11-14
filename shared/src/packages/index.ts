// The declarative descriptions of the package formats (sw-architecture.md 14.4, 19.7), by package and
// format version. A new format version gets its own definition; the older ones stay, because the
// platform reads every version it lists.
import type { PackageDefinition } from "./definition.ts";
import { themeV1 } from "./theme-v1.ts";
import { worldV1 } from "./world-v1.ts";

export * from "./codes.ts";
export type * from "./definition.ts";
export { themeV1, worldV1 };

/** Every definition: the package, then its format version. */
export const PACKAGE_DEFINITIONS = {
  theme: { 1: themeV1 },
  world: { 1: worldV1 },
} as const;

/** Every definition as a list, for the checks that apply to all of them. */
export const ALL_DEFINITIONS: readonly PackageDefinition<string>[] = [
  ...Object.values(PACKAGE_DEFINITIONS.theme),
  ...Object.values(PACKAGE_DEFINITIONS.world),
];
