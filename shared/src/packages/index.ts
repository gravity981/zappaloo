// The declarative descriptions of the package formats (sw-architecture.md 14.4, 19.7), by package and
// format version. A new format version gets its own definition. For the time being the older
// ones are removed, because the formats are not kept backwards compatible (19.7).
import type { PackageDefinition } from "./definition.ts";
import { themeV2 } from "./theme-v2.ts";
import { worldV2 } from "./world-v2.ts";
import { worldV3 } from "./world-v3.ts";

export * from "./codes.ts";
export type * from "./definition.ts";
export { themeV2, worldV2, worldV3 };

/** Every definition: the package, then its format version. */
export const PACKAGE_DEFINITIONS = {
  theme: { 2: themeV2 },
  world: { 2: worldV2, 3: worldV3 },
} as const;

/** Every definition as a list, for the checks that apply to all of them. */
export const ALL_DEFINITIONS: readonly PackageDefinition<string>[] = [
  ...Object.values(PACKAGE_DEFINITIONS.theme),
  ...Object.values(PACKAGE_DEFINITIONS.world),
];
