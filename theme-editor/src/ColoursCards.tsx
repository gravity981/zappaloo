import { THEME_COLOR_KEYS, WAITING_COLOR_KEYS } from "@zappaloo/shared";
import type { ThemeColorKey, WaitingColorKey } from "@zappaloo/shared";
import { Card, ColorField, Switch } from "./components.tsx";
import { contrastChecks, HEX } from "./model.ts";
import {
  bestOnColor,
  paletteIsReadable,
  paletteMatches,
  randomMaster,
  suggestPalettes,
} from "./palette.ts";
import type { Palette } from "./palette.ts";
import type { ThemeDraft, Update } from "./model.ts";

const COLOR_HINTS: Record<ThemeColorKey, string> = {
  background: "the page",
  surface: "cards and fields",
  text: "main text",
  muted: "secondary text",
  line: "borders",
  accent: "buttons, highlights",
  onAccent: "text on accent",
};

const WAITING_HINTS: Record<WaitingColorKey, string> = {
  card: "the card",
  text: "its text",
  button: "its button",
  onButton: "the button's text",
};

const SWATCHES: (keyof Palette["colors"])[] = [
  "background",
  "surface",
  "text",
  "muted",
  "line",
  "accent",
  "onAccent",
];

/** The master colour and the palettes made from it (THM-15). */
function Assistant(props: { draft: ThemeDraft; onChange: Update }) {
  const { draft, onChange } = props;
  const master = draft.colors.accent;
  const valid = HEX.test(master);
  const palettes = valid ? suggestPalettes(master) : [];

  function setMaster(accent: string) {
    onChange((current) => ({ ...current, colors: { ...current.colors, accent } }));
  }
  function surprise() {
    const accent = randomMaster();
    // onAccent follows, so that the accent still has readable text on it
    onChange((current) => ({
      ...current,
      colors: { ...current.colors, accent, onAccent: bestOnColor(accent) },
    }));
  }
  function pick(palette: Palette) {
    onChange((current) => ({
      ...current,
      colors: { ...palette.colors },
      waiting: current.waitingEnabled ? { ...palette.waiting } : current.waiting,
    }));
  }

  return (
    <>
      <ColorField
        label="master colour"
        hint="the accent; the suggestions are made from it"
        value={master}
        onChange={setMaster}
      />
      <button
        type="button"
        className="btn soft sm"
        style={{ alignSelf: "flex-start" }}
        onClick={surprise}
      >
        Surprise me
      </button>
      <span className="eyebrow">Suggested palettes</span>
      {valid ? (
        <div className="palette-grid">
          {palettes.map((palette) => {
            const picked = paletteMatches(palette, draft.colors);
            const readable = paletteIsReadable(palette);
            return (
              <button
                type="button"
                key={palette.id}
                className={`palette-card${picked ? " on" : ""}`}
                aria-pressed={picked}
                aria-label={`${palette.name} palette`}
                onClick={() => {
                  pick(palette);
                }}
              >
                <b className="sm">{palette.name}</b>
                <span className="palette-swatches" aria-hidden="true">
                  {SWATCHES.map((key) => (
                    <i key={key} style={{ background: palette.colors[key] }} title={key} />
                  ))}
                </span>
                <span className="hint">{palette.description}</span>
                <span className={`tag ${readable ? "ok" : "bad"}`}>
                  {readable ? "✓ all pairs" : "✗"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <span className="hint">
          Enter a full #rrggbb colour as the master colour to get suggestions.
        </span>
      )}
      <span className="hint">
        Picking a card fills the seven colours
        {draft.waitingEnabled ? " and the waiting card colours" : ""}. The accent stays the master
        colour. Colours you change afterwards stay as they are.
      </span>
    </>
  );
}

/** The cards Colours, Contrast check and Waiting card (THM-09, THM-15). */
export function ColoursCards(props: { draft: ThemeDraft; onChange: Update }) {
  const { draft, onChange } = props;
  const checks = contrastChecks(draft);
  return (
    <>
      <Card id="colours-title" title="Colours">
        <Assistant draft={draft} onChange={onChange} />
        <span className="eyebrow">The seven colours</span>
        <div className="stack">
          {THEME_COLOR_KEYS.map((key) => (
            <ColorField
              key={key}
              label={key}
              hint={COLOR_HINTS[key]}
              value={draft.colors[key]}
              onChange={(value) => {
                onChange({ ...draft, colors: { ...draft.colors, [key]: value } });
              }}
            />
          ))}
        </div>
      </Card>

      <Card id="contrast-title" title="Contrast check">
        <span className="hint">As the validator checks it: at least 4.5 : 1.</span>
        {checks.length === 0 ? (
          <span className="hint">Waiting for complete colours (#rrggbb).</span>
        ) : (
          <div className="list">
            {checks.map((check) => (
              <div
                className="setrow"
                key={`${check.foreground}-${check.background}`}
                data-ok={check.ok}
              >
                <span
                  className="pair-swatch"
                  aria-hidden="true"
                  style={{ background: check.backgroundColor, color: check.foregroundColor }}
                >
                  Aa
                </span>
                <div className="grow">
                  <b className="sm">
                    {check.foreground} on {check.background}
                  </b>
                </div>
                <span className={`tag ${check.ok ? "ok" : "bad"}`}>
                  {check.ok ? "✓" : "✗"} {check.ratio.toFixed(1)} : 1
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <section className="card" aria-labelledby="waiting-title">
        <div className="setrow">
          <div className="grow">
            <b id="waiting-title" className="h2">
              Own waiting card colours
            </b>
            <span className="hint"> Off: the waiting card uses the platform's colours.</span>
          </div>
          <Switch
            label="Own waiting card colours"
            on={draft.waitingEnabled}
            onChange={(waitingEnabled) => {
              onChange({ ...draft, waitingEnabled });
            }}
          />
        </div>
        {draft.waitingEnabled
          ? WAITING_COLOR_KEYS.map((key) => (
              <ColorField
                key={key}
                label={`waiting ${key}`}
                hint={WAITING_HINTS[key]}
                value={draft.waiting[key]}
                onChange={(value) => {
                  onChange({ ...draft, waiting: { ...draft.waiting, [key]: value } });
                }}
              />
            ))
          : null}
      </section>
    </>
  );
}
