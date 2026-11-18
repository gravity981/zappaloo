import { THEME_COLOR_KEYS, WAITING_COLOR_KEYS } from "@zappaloo/shared";
import type { ThemeColorKey, WaitingColorKey } from "@zappaloo/shared";
import { Card, ColorField, Switch } from "./components.tsx";
import { contrastChecks } from "./model.ts";
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

/** The cards Colours, Contrast check and Waiting card (THM-09). */
export function ColoursCards(props: { draft: ThemeDraft; onChange: Update }) {
  const { draft, onChange } = props;
  const checks = contrastChecks(draft);
  return (
    <>
      <Card id="colours-title" title="Colours">
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
