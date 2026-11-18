import { useState } from "react";
import { Card } from "./components.tsx";
import { ColoursCards } from "./ColoursCards.tsx";
import { FontsCard } from "./FontsCard.tsx";
import { IconsCard } from "./IconsCard.tsx";
import { newDraft } from "./model.ts";
import type { ThemeDraft } from "./model.ts";

/** The theme package editor (spec/mocks, screen `theme-editor`). Stories 5.2d to 5.2f add icons, preview, export, open and draft. */
export default function App() {
  const [draft, setDraft] = useState<ThemeDraft>(newDraft);
  return (
    <div className="admin editor">
      <header className="admin-head">
        <strong>Theme package editor</strong>
        <span className="tag">development only</span>
      </header>
      <main className="editor-main">
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
      </main>
    </div>
  );
}
