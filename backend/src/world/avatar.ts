// The avatar assets of the world package (sw-architecture.md 14.4, 7.3): `avatar/avatar.json` with its
// palettes, parts, options and templates, and the sprite sheets its PNG files name.
import { AVATAR_PART_NAMES, worldAvatarSchema } from "@zappaloo/shared";
import type { AvatarPart, AvatarPartName, WorldAvatar } from "@zappaloo/shared";
import type { PngSize } from "../packages/png.ts";
import { errorFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";

const AVATAR_FILE = "avatar/avatar.json";

export interface AvatarResult {
  avatar?: WorldAvatar;
  findings: WorldFinding[];
}

/** Checks `avatar/avatar.json` and the sprite sheets of the package. */
export function checkAvatar(
  bytes: Buffer,
  files: Map<string, Buffer>,
  images: Map<string, PngSize>,
): AvatarResult {
  const findings: WorldFinding[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    return { findings: [errorFinding(AVATAR_FILE, "json_invalid", "not valid JSON")] };
  }
  const parsed = worldAvatarSchema.safeParse(raw);
  if (!parsed.success) {
    return { findings: [errorFinding(AVATAR_FILE, "json_field", zodDetail(parsed.error))] };
  }
  const avatar = parsed.data;
  const palettes = new Map(Object.entries(avatar.palettes));

  // Parts: palettes that exist, the colour of the stored avatar, optional parts.
  for (const name of AVATAR_PART_NAMES) {
    const part = avatar.parts[name];
    if (part.palette !== undefined && !palettes.has(part.palette)) {
      findings.push(
        errorFinding(AVATAR_FILE, "avatar_palette", `palette ${part.palette} is not defined`, name),
      );
    }
    checkPartColour(name, part, findings);
    checkOptions(name, part, files, images, avatar, findings);
  }

  // Every PNG of avatar/ is named by avatar.json.
  const named = new Set<string>();
  for (const name of AVATAR_PART_NAMES) {
    for (const option of avatar.parts[name].options) {
      named.add(`avatar/${option.file}`);
      if (option.detail !== undefined) named.add(`avatar/${option.detail}`);
    }
  }
  for (const path of files.keys()) {
    if (path.startsWith("avatar/") && path.endsWith(".png") && !named.has(path)) {
      findings.push(errorFinding(path, "file_unreferenced", "avatar.json does not name the file"));
    }
  }

  for (const [index, template] of avatar.templates.entries()) {
    checkTemplate(
      `template ${String(index + 1)} (${template.label})`,
      template.avatar,
      avatar,
      palettes,
      findings,
    );
  }

  if (findings.length > 0) return { findings };
  return { avatar, findings };
}

/** The colour rules: body, outfit and hair have a palette (their colour is stored); accessory has none. */
function checkPartColour(name: AvatarPartName, part: AvatarPart, findings: WorldFinding[]): void {
  if ((name === "body" || name === "outfit") && part.optional === true) {
    findings.push(errorFinding(AVATAR_FILE, "avatar_part", "the part cannot be optional", name));
  }
  if (name === "accessory" && part.palette !== undefined) {
    findings.push(
      errorFinding(
        AVATAR_FILE,
        "avatar_part",
        "an accessory has no colour; remove its palette",
        name,
      ),
    );
  } else if (name !== "accessory" && part.palette === undefined) {
    findings.push(
      errorFinding(
        AVATAR_FILE,
        "avatar_part",
        "the part needs a palette, its colour is stored",
        name,
      ),
    );
  }
}

/** The options of a part: unique ids, a sprite sheet of exactly the frames' size for each PNG. */
function checkOptions(
  name: AvatarPartName,
  part: AvatarPart,
  files: Map<string, Buffer>,
  images: Map<string, PngSize>,
  avatar: WorldAvatar,
  findings: WorldFinding[],
): void {
  const ids = new Set<string>();
  const width = avatar.frameWidth * 4;
  const height = avatar.frameHeight * 4;
  for (const option of part.options) {
    if (ids.has(option.id)) {
      findings.push(
        errorFinding(AVATAR_FILE, "avatar_option", `option ${option.id} is used twice`, name),
      );
    }
    ids.add(option.id);
    for (const file of [option.file, option.detail]) {
      if (file === undefined) continue;
      const path = `avatar/${file}`;
      if (!files.has(path)) {
        findings.push(
          errorFinding(path, "file_missing", `the sprite sheet of ${option.id} is missing`, name),
        );
        continue;
      }
      const size = images.get(path);
      if (size !== undefined && (size.width !== width || size.height !== height)) {
        findings.push(
          errorFinding(
            path,
            "avatar_sheet",
            `the sheet is ${String(size.width)} × ${String(size.height)} instead of ${String(width)} × ${String(height)} (4 × 4 frames)`,
            name,
          ),
        );
      }
    }
  }
}

/** A template is a complete stored avatar whose ids and colours exist (7.3). */
function checkTemplate(
  label: string,
  config: WorldAvatar["templates"][number]["avatar"],
  avatar: WorldAvatar,
  palettes: Map<string, string[]>,
  findings: WorldFinding[],
): void {
  const add = (detail: string) => {
    findings.push(errorFinding(AVATAR_FILE, "avatar_template", `${label}: ${detail}`));
  };
  const hasOption = (name: AvatarPartName, id: string | null) => {
    if (id === null) return avatar.parts[name].optional === true;
    return avatar.parts[name].options.some((option) => option.id === id);
  };
  const inPalette = (name: AvatarPartName, colour: string | null) => {
    const palette = avatar.parts[name].palette;
    if (colour === null || palette === undefined) return colour === null;
    return (palettes.get(palette) ?? []).some(
      (value) => value.toLowerCase() === colour.toLowerCase(),
    );
  };

  if (!hasOption("body", config.body)) add(`body ${config.body} does not exist`);
  if (!hasOption("outfit", config.outfit)) add(`outfit ${config.outfit} does not exist`);
  if (!hasOption("hair", config.hair))
    add(`hair ${String(config.hair)} does not exist or is required`);
  if (!hasOption("accessory", config.accessory)) {
    add(`accessory ${String(config.accessory)} does not exist or is required`);
  }
  if (!inPalette("body", config.skin)) add(`skin ${config.skin} is not a colour of the body`);
  if (!inPalette("outfit", config.outfitColor)) {
    add(`outfit colour ${config.outfitColor} is not a colour of the outfit`);
  }
  if (config.hair === null) {
    if (config.hairColor !== null) add("a hair colour without hair");
  } else if (!inPalette("hair", config.hairColor)) {
    add(`hair colour ${String(config.hairColor)} is not a colour of the hair`);
  }
}
