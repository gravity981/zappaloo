// The colour of the silhouettes of figures behind objects (GAME-42): the event's accent colour, as the theme sets it on
// the page (`--a-dark`, themeStyle.ts). The engine knows no theme, so the page reads the colour and hands it over.

/** `#rgb` or `#rrggbb` as the number 0xRRGGBB; anything else (a name, `rgb()`, nothing) is undefined. */
export function parseHexColor(value: string): number | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  const digits = match?.[1];
  if (digits === undefined) return undefined;
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return Number.parseInt(full, 16);
}

/** The accent colour in force at the element; undefined without a hexadecimal one, then the engine's own colour stays. */
export function accentColorAt(element: Element): number | undefined {
  return parseHexColor(getComputedStyle(element).getPropertyValue("--a-dark"));
}
