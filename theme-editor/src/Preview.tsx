import { useEffect, useState } from "react";
import Markdown from "../../frontend/src/app/Markdown.tsx";
import { fontFaceRules, themeStyle } from "../../frontend/src/app/themeStyle.ts";
import { pngDataUrl } from "./icons.ts";
import { draftToSiteTheme } from "./previewTheme.ts";
import type { ThemeDraft } from "./model.ts";

const CONTENT_PAGE = `# Anreise

Mit dem Zug bis **Muri**, dann zehn Minuten zu Fuss.

## Parkplätze

- beim Schloss
- an der Kirche

Stand: Mai 2027 · [Karte öffnen](https://example.org/karte)`;

const WELCOME = `# Wir heiraten!

Wir freuen uns riesig, diesen Tag mit euch zu feiern. Hier findet ihr alles, was ihr wissen müsst.`;

/** The object URLs of the font files, made for the files of the draft and released with them. */
function useFontUrls(fonts: ThemeDraft["fonts"]): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const created = new Map<string, string>();
    for (const font of Object.values(fonts)) {
      for (const file of font?.files ?? []) {
        created.set(
          file.id,
          URL.createObjectURL(new Blob([file.woff2.slice()], { type: "font/woff2" })),
        );
      }
    }
    setUrls(created);
    return () => {
      for (const url of created.values()) URL.revokeObjectURL(url);
    };
  }, [fonts]);
  return urls;
}

function Tile(props: { label: string; png: Uint8Array | undefined; shape: string }) {
  return (
    <div className="home-app">
      <div className={`home-icon ${props.shape}`}>
        {props.png === undefined ? (
          <span className="hint">none</span>
        ) : (
          <img alt={props.label} src={pngDataUrl(props.png)} width={56} height={56} />
        )}
      </div>
      <small>{props.label}</small>
    </div>
  );
}

/**
 * The preview (THM-11): sample elements built with the app's own stylesheets, `themeStyle()` and
 * `fontFaceRules()`, not the real pages. They follow every change of the draft at once.
 */
export function Preview(props: { draft: ThemeDraft }) {
  const { draft } = props;
  const urls = useFontUrls(draft.fonts);
  const theme = draftToSiteTheme(draft, urls);
  const name = draft.name.trim() === "" ? "Sommerfest" : draft.name.trim();
  const { files } = draft.icons;
  return (
    <div className="themed preview" style={themeStyle(theme)} aria-label="Preview">
      <style>{fontFaceRules(theme)}</style>
      <div className="guest preview-body">
        <span className="eyebrow">Website bar</span>
        <div className="guest-site-head preview-site-bar" aria-label="Website bar">
          <b>{name}</b>
          <nav>
            <a className="active">Start</a>
            <a>Programm</a>
            <a>Mehr</a>
          </nav>
        </div>
        <span className="eyebrow">Start page</span>
        <section className="preview-block start-main" aria-label="Start page">
          <div className="preview-hero" aria-hidden="true">
            hero image
          </div>
          <Markdown text={WELCOME} />
          <section className="card strong">
            <span className="eyebrow">Noch</span>
            <b className="countdown-days">214 Tage</b>
            <span className="hint">Sa, 12. Juni 2027 · Kirche Muri</span>
          </section>
        </section>

        <span className="eyebrow">Content page (Markdown)</span>
        <section className="preview-block page-text" aria-label="Content page">
          <Markdown text={CONTENT_PAGE} />
        </section>

        <span className="eyebrow">Form</span>
        <section className="preview-block stack" aria-label="Form">
          <div className="field">
            <span>Name</span>
            <input className="input" aria-label="Sample name" defaultValue="Erika Huber" />
          </div>
          <div className="field">
            <span>Allergien</span>
            <input className="input" aria-label="Sample allergies" placeholder="optional" />
          </div>
          <div className="row">
            <button type="button" className="btn">
              Speichern
            </button>
            <button type="button" className="btn soft">
              Mehr erfahren
            </button>
            <button type="button" className="btn ghost">
              Abbrechen
            </button>
          </div>
        </section>

        <span className="eyebrow">Waiting card</span>
        <div className="preview-door">
          <section className="waiting-card" aria-label="Waiting card">
            <p>Psst, Erika … hinter dieser Tür entsteht gerade etwas. Bist du dabei?</p>
            <a className="waiting-button">Jetzt anmelden</a>
          </section>
        </div>

        <span className="eyebrow">App icons</span>
        <div className="home-screen" aria-label="Home screen">
          <Tile label={name} png={files["apple-touch-icon"]?.png} shape="plain" />
          <Tile label="maskable, circle" png={files["icon-maskable-512"]?.png} shape="circle" />
          <Tile label="maskable, rounded" png={files["icon-maskable-512"]?.png} shape="squircle" />
        </div>
      </div>
    </div>
  );
}
