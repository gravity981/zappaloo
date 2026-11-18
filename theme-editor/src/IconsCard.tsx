import { useState } from "react";
import { Card, ColorField } from "./components.tsx";
import {
  decodeImage,
  ICONS,
  MIN_SOURCE_SIZE,
  ownIconProblem,
  pngDataUrl,
  renderIcon,
  sourceProblem,
} from "./icons.ts";
import type { IconSpec } from "./icons.ts";
import { HEX } from "./model.ts";
import type { DraftIcon, ThemeDraft } from "./model.ts";

/** Makes the icons that are not the icon's own from the source image. */
async function makeIcons(
  draft: ThemeDraft,
  source: NonNullable<ThemeDraft["icons"]["source"]>,
  background: string,
): Promise<Record<string, DraftIcon | undefined>> {
  const image = await decodeImage(source.bytes, source.mime);
  try {
    const files: Record<string, DraftIcon | undefined> = { ...draft.icons.files };
    for (const spec of ICONS) {
      if (files[spec.name]?.own === true) continue;
      files[spec.name] = {
        png: await renderIcon(image, spec, background),
        own: false,
      };
    }
    return files;
  } finally {
    image.close();
  }
}

/** The card Icons: one square image makes the four icons; each can be replaced (THM-10). */
export function IconsCard(props: { draft: ThemeDraft; onChange: (draft: ThemeDraft) => void }) {
  const { draft, onChange } = props;
  const { icons } = draft;
  const [problem, setProblem] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string | undefined>>({});

  async function chooseSource(file: File) {
    setProblem(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setProblem(`${file.name}: use a PNG or JPEG image`);
      return;
    }
    try {
      const image = await decodeImage(bytes, file.type);
      const { width, height } = image;
      image.close();
      const refusal = sourceProblem(width, height);
      if (refusal !== undefined) {
        setProblem(`${file.name}: ${refusal}`);
        return;
      }
      const source = { fileName: file.name, mime: file.type, bytes, width };
      const files = await makeIcons(draft, source, icons.maskableBackground);
      onChange({ ...draft, icons: { ...icons, source, files } });
    } catch {
      setProblem(`${file.name}: the image cannot be read`);
    }
  }

  async function setBackground(maskableBackground: string) {
    if (icons.source === null || !HEX.test(maskableBackground)) {
      onChange({ ...draft, icons: { ...icons, maskableBackground } });
      return;
    }
    const maskable = ICONS.find((spec) => spec.maskable);
    if (maskable === undefined || icons.files[maskable.name]?.own === true) {
      onChange({ ...draft, icons: { ...icons, maskableBackground } });
      return;
    }
    const image = await decodeImage(icons.source.bytes, icons.source.mime);
    try {
      const png = await renderIcon(image, maskable, maskableBackground);
      onChange({
        ...draft,
        icons: {
          ...icons,
          maskableBackground,
          files: { ...icons.files, [maskable.name]: { png, own: false } },
        },
      });
    } finally {
      image.close();
    }
  }

  async function replace(spec: IconSpec, file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const refusal = ownIconProblem(spec, bytes);
    setProblems((before) => ({ ...before, [spec.name]: refusal }));
    if (refusal !== undefined) return;
    onChange({
      ...draft,
      icons: { ...icons, files: { ...icons.files, [spec.name]: { png: bytes, own: true } } },
    });
  }

  async function useGenerated(spec: IconSpec) {
    if (icons.source === null) return;
    const image = await decodeImage(icons.source.bytes, icons.source.mime);
    try {
      const png = await renderIcon(image, spec, icons.maskableBackground);
      setProblems((before) => ({ ...before, [spec.name]: undefined }));
      onChange({
        ...draft,
        icons: { ...icons, files: { ...icons.files, [spec.name]: { png, own: false } } },
      });
    } finally {
      image.close();
    }
  }

  function remove(spec: IconSpec) {
    const files = { ...icons.files, [spec.name]: undefined };
    onChange({ ...draft, icons: { ...icons, files } });
  }

  return (
    <Card id="icons-title" title="Icons">
      <div className="row">
        <label className="btn soft sm">
          {icons.source === null ? "Choose a square image" : "Choose another image"}
          <input
            className="visually-hidden"
            type="file"
            aria-label="Image for the icons"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void chooseSource(file);
            }}
          />
        </label>
        {icons.source === null ? (
          <span className="hint">
            PNG or JPEG, square, at least {MIN_SOURCE_SIZE} px. The four icons are made from it.
          </span>
        ) : (
          <span className="tag ok">
            {icons.source.fileName} · {icons.source.width} × {icons.source.width}
          </span>
        )}
      </div>
      {problem === null ? null : (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      <ColorField
        label="maskable background"
        hint="the content sits inside the central 80 %"
        value={icons.maskableBackground}
        onChange={(value) => {
          void setBackground(value);
        }}
      />
      <div className="icon-grid">
        {ICONS.map((spec) => {
          const icon = icons.files[spec.name];
          return (
            <div className="icon-tile" key={spec.name}>
              <div className={`icon-frame${spec.maskable ? " maskable" : ""}`}>
                {icon === undefined ? (
                  <span className="hint">none</span>
                ) : (
                  <img
                    alt={`${spec.name} icon`}
                    src={pngDataUrl(icon.png)}
                    width={72}
                    height={72}
                  />
                )}
                {spec.maskable && icon !== undefined ? (
                  <span className="safe-zone" aria-hidden="true" />
                ) : null}
              </div>
              <b className="sm">{spec.name}</b>
              <span className="hint">
                {spec.size} × {spec.size}
                {spec.required ? "" : " · optional"}
                {icon?.own === true ? " · own file" : ""}
              </span>
              <div className="row">
                <label className="btn ghost sm">
                  Replace
                  <input
                    className="visually-hidden"
                    type="file"
                    accept="image/png"
                    aria-label={`Replace ${spec.name}`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file !== undefined) void replace(spec, file);
                    }}
                  />
                </label>
                {icon?.own === true && icons.source !== null ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={`Use the generated ${spec.name}`}
                    onClick={() => {
                      void useGenerated(spec);
                    }}
                  >
                    Use generated
                  </button>
                ) : null}
                {!spec.required && icon !== undefined ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={`Remove ${spec.name}`}
                    onClick={() => {
                      remove(spec);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {problems[spec.name] === undefined ? null : (
                <p role="alert" className="error">
                  {problems[spec.name]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
