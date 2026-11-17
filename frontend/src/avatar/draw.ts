// Drawing a figure at random in the avatar editor (sw-architecture.md 7.3): "Zufällig" draws only within the kind.
import type { AvatarFigure } from "@zappaloo/shared";

/** The kinds, in the order of the buttons. */
export const KINDS = ["male", "female", "child", "other"] as const;
export type Kind = (typeof KINDS)[number];

/** A figure of the kind at random: another one than `current` when the kind has more. */
export function drawFigure(
  figures: readonly AvatarFigure[],
  kind: Kind,
  current: string | null,
  random: () => number = Math.random,
): string | undefined {
  const pool = figures.filter((figure) => figure.type === kind);
  const others = pool.filter((figure) => figure.id !== current);
  const from = others.length > 0 ? others : pool;
  return from[Math.floor(random() * from.length)]?.id;
}
