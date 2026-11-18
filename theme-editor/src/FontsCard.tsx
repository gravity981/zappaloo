import { useEffect, useRef, useState } from "react";
import { SIZE_ADJUST } from "@zappaloo/shared";
import { THEME_LIMITS } from "@zappaloo/shared";
import { convertFont, FontError } from "./api.ts";
import { Card, Switch } from "./components.tsx";
import {
  FAMILY,
  FONT_SLOTS,
  fontFileCount,
  roomForFiles,
  uniqueFileName,
  validSizeAdjust,
} from "./model.ts";
import type { Update } from "./model.ts";
import type { DraftFont, DraftFontFile, FontSlot, ThemeDraft } from "./model.ts";

const SLOT_TITLES: Record<FontSlot, string> = {
  body: "Body",
  heading: "Heading",
  display: "Display",
};
const SLOT_HINTS: Record<FontSlot, string> = {
  body: "Off: the platform's font is used.",
  heading: "Off: the platform's font is used.",
  display: "Off: the countdown uses the heading font.",
};
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function kb(bytes: number): string {
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

let nextId = 1;

/**
 * «Size adjust» of one font (THM-16): a slider and a number field, 50–200 percent. The preview follows
 * at once. A number that is typed but not (yet) valid is kept in the field and not given to the draft.
 */
function SizeAdjust(props: { title: string; value: number; onChange: (value: number) => void }) {
  const { title, value, onChange } = props;
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  const typed = Number(text);
  const valid = text.trim() !== "" && validSizeAdjust(typed);
  return (
    <div className="size-adjust">
      <span className="sm">
        <b>Size adjust</b>
      </span>
      <input
        type="range"
        min={SIZE_ADJUST.min}
        max={SIZE_ADJUST.max}
        aria-label={`${title} size adjust`}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
      <input
        className="input"
        inputMode="numeric"
        aria-label={`${title} size adjust in percent`}
        aria-invalid={!valid}
        value={text}
        maxLength={3}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== "" && validSizeAdjust(next)) onChange(next);
        }}
      />
      <span className="sm">%</span>
      {valid ? null : (
        <small className="error">
          A whole number from {SIZE_ADJUST.min} to {SIZE_ADJUST.max}
        </small>
      )}
    </div>
  );
}

/** The card Fonts: body, heading and display, each off or a family with 1–4 files (THM-09). */
export function FontsCard(props: { draft: ThemeDraft; onChange: Update }) {
  const { draft, onChange } = props;
  const latest = useRef(draft);
  latest.current = draft;
  const [problems, setProblems] = useState<Partial<Record<FontSlot, string[]>>>({});

  function setFont(slot: FontSlot, font: DraftFont | null) {
    onChange({ ...draft, fonts: { ...draft.fonts, [slot]: font } });
  }

  async function addFiles(slot: FontSlot, files: File[]) {
    // Each file is converted on the development server, which can take seconds. The draft may change
    // meanwhile, so a finished file is added to the draft as it is then, not as it was at the start.
    const messages: string[] = [];
    let room = roomForFiles(latest.current, slot);
    for (const file of files) {
      if (room === 0) {
        messages.push(`${file.name}: a font has at most 4 files and a theme at most 8`);
        continue;
      }
      try {
        const { file: converted, suggestion } = await convertFont(file);
        room -= 1;
        const id = `f${String(nextId++)}`;
        onChange((current) => {
          if (roomForFiles(current, slot) === 0) return current;
          const entry: DraftFontFile = {
            ...converted,
            id,
            fileName: uniqueFileName(current, converted.fileName),
            weight: suggestion.weight,
            style: suggestion.style,
          };
          // The first file names the family of a font that has none yet.
          const existing = current.fonts[slot] ?? { family: "", sizeAdjust: 100, files: [] };
          const font =
            existing.family === "" ? { ...existing, family: suggestion.family } : existing;
          return {
            ...current,
            fonts: { ...current.fonts, [slot]: { ...font, files: [...font.files, entry] } },
          };
        });
      } catch (error) {
        if (error instanceof FontError) {
          messages.push(
            `${file.name}: ${error.findings.map((finding) => finding.detail).join("; ") || error.message}`,
          );
        } else {
          messages.push(`${file.name}: the development server did not answer`);
        }
      }
    }
    setProblems((before) => ({ ...before, [slot]: messages }));
  }

  const total = fontFileCount(draft);
  return (
    <Card id="fonts-title" title="Fonts">
      <div className="row">
        <span className="hint grow">
          WOFF2, OTF or TTF, at most 2 MB each after conversion. OTF and TTF are converted to WOFF2
          here.
        </span>
        <span className="tag line">
          {total} of {THEME_LIMITS.fontCount} files
        </span>
      </div>
      {FONT_SLOTS.map((slot) => {
        const font = draft.fonts[slot];
        const title = SLOT_TITLES[slot];
        const familyValid = font === null || FAMILY.test(font.family);
        return (
          <div className="font-slot" key={slot}>
            <div className="setrow">
              <b className="grow">{title}</b>
              <Switch
                label={`${title} font`}
                on={font !== null}
                onChange={(on) => {
                  setFont(slot, on ? { family: "", sizeAdjust: 100, files: [] } : null);
                }}
              />
            </div>
            {font === null ? (
              <span className="hint">{SLOT_HINTS[slot]} Adding a font file switches it on.</span>
            ) : (
              <>
                <div className="field">
                  <span>{title} family</span>
                  <input
                    className="input"
                    aria-label={`${title} family`}
                    aria-invalid={!familyValid}
                    value={font.family}
                    maxLength={40}
                    onChange={(event) => {
                      setFont(slot, { ...font, family: event.target.value });
                    }}
                  />
                  {familyValid ? null : (
                    <small className="error">1–40 letters, digits, spaces and hyphens</small>
                  )}
                </div>
                <SizeAdjust
                  title={title}
                  value={font.sizeAdjust}
                  onChange={(sizeAdjust) => {
                    setFont(slot, { ...font, sizeAdjust });
                  }}
                />
                {font.files.map((file) => (
                  <div className="font-file" key={file.id}>
                    <span className="grow">
                      <b className="sm">{file.fileName}</b>{" "}
                      <span className="hint">
                        {file.converted ? "converted · " : ""}
                        {kb(file.size)}
                      </span>
                    </span>
                    <select
                      className="input"
                      aria-label={`${file.fileName} weight`}
                      value={file.weight}
                      onChange={(event) => {
                        updateFile(slot, font, file.id, { weight: Number(event.target.value) });
                      }}
                    >
                      {WEIGHTS.map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      aria-label={`${file.fileName} style`}
                      value={file.style}
                      onChange={(event) => {
                        updateFile(slot, font, file.id, {
                          style: event.target.value === "italic" ? "italic" : "normal",
                        });
                      }}
                    >
                      <option value="normal">normal</option>
                      <option value="italic">italic</option>
                    </select>
                    <button
                      type="button"
                      className="btn ghost sm"
                      aria-label={`Remove ${file.fileName}`}
                      onClick={() => {
                        const files = font.files.filter((other) => other.id !== file.id);
                        setFont(slot, { ...font, files });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </>
            )}
            <label
              className={`btn soft sm${roomForFiles(draft, slot) === 0 ? " disabled" : ""}`}
              style={{ alignSelf: "flex-start" }}
            >
              Add font file
              <input
                className="visually-hidden"
                type="file"
                multiple
                aria-label={`Add ${title} font file`}
                accept=".woff2,.otf,.ttf,font/woff2,font/otf,font/ttf"
                disabled={roomForFiles(draft, slot) === 0}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = "";
                  void addFiles(slot, files);
                }}
              />
            </label>
            {(problems[slot] ?? []).map((message) => (
              <p role="alert" className="error" key={message}>
                {message}
              </p>
            ))}
          </div>
        );
      })}
    </Card>
  );

  function updateFile(slot: FontSlot, font: DraftFont, id: string, change: Partial<DraftFontFile>) {
    setFont(slot, {
      ...font,
      files: font.files.map((file) => (file.id === id ? { ...file, ...change } : file)),
    });
  }
}
