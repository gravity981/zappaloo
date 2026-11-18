import { useState } from "react";
import { Card } from "./components.tsx";
import { ColoursCards } from "./ColoursCards.tsx";
import { FontsCard } from "./FontsCard.tsx";
import { IconsCard } from "./IconsCard.tsx";
import { newDraft } from "./model.ts";
import type { ThemeDraft } from "./model.ts";
import { Preview } from "./Preview.tsx";

type Pane = "edit" | "preview";

/**
 * The theme package editor (spec/mocks, screen `theme-editor`). Wide: the controls on the left and
 * the preview on the right. Narrow: the tabs «Edit» and «Preview». Story 5.2f adds export, open and
 * the draft that survives a reload.
 */
export default function App() {
  const [draft, setDraft] = useState<ThemeDraft>(newDraft);
  const [pane, setPane] = useState<Pane>("edit");
  return (
    <div className="admin editor">
      <header className="admin-head">
        <strong>Theme package editor</strong>
        <span className="tag">development only</span>
      </header>
      <div className="editor-bar">
        <div className="subtabs" role="group" aria-label="Edit or preview">
          {(["edit", "preview"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={pane === id}
              onClick={() => {
                setPane(id);
              }}
            >
              {id === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
      </div>
      <main className="editor-main" data-pane={pane}>
        <div className="editor-edit">
          <Card id="name-title" title="Name">
            <div className="field">
              <span>Name of the theme package</span>
              <input
                className="input"
                aria-label="Name of the theme package"
                value={draft.name}
                maxLength={60}
                placeholder="e.g. Sommerfest"
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                }}
              />
              <small className="hint">1–60 characters.</small>
            </div>
          </Card>
          <ColoursCards draft={draft} onChange={setDraft} />
          <FontsCard draft={draft} onChange={setDraft} />
          <IconsCard draft={draft} onChange={setDraft} />
        </div>
        <div className="editor-preview">
          <Preview draft={draft} />
        </div>
      </main>
    </div>
  );
}
