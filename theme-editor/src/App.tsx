import { useEffect, useRef, useState } from "react";
import { Actions } from "./Actions.tsx";
import type { Report, SaveState } from "./Actions.tsx";
import { Card } from "./components.tsx";
import { ColoursCards } from "./ColoursCards.tsx";
import { browserStore } from "./draftStore.ts";
import type { DraftStore } from "./draftStore.ts";
import { FontsCard } from "./FontsCard.tsx";
import { IconsCard } from "./IconsCard.tsx";
import { newDraft } from "./model.ts";
import type { ThemeDraft } from "./model.ts";
import { Preview } from "./Preview.tsx";

type Pane = "edit" | "preview";

/** The pause after the last change before the draft is saved. */
const SAVE_DELAY_MS = 300;

/**
 * The theme package editor (spec/mocks, screen `theme-editor`). Wide: the controls on the left and
 * the preview on the right. Narrow: the tabs «Edit» and «Preview». The work is kept in the browser
 * (THM-14); «Export» and «Open package…» go through the development server (THM-12, THM-13).
 */
export default function App(props: { store?: DraftStore }) {
  const [store] = useState<DraftStore>(() => props.store ?? browserStore());
  const [draft, setDraft] = useState<ThemeDraft>(newDraft);
  const [pane, setPane] = useState<Pane>("edit");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [report, setReport] = useState<Report | null>(null);
  // Nothing is saved before the stored draft has been loaded, so an empty start never overwrites it.
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    store
      .load()
      .then((stored) => {
        if (cancelled) return;
        if (stored !== null) setDraft(stored);
        loaded.current = true;
        setSaveState("saved");
      })
      .catch(() => {
        if (cancelled) return;
        loaded.current = true;
        setSaveState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!loaded.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      store.save(draft).then(
        () => {
          setSaveState("saved");
        },
        () => {
          setSaveState("failed");
        },
      );
    }, SAVE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, store]);

  function startNew() {
    setDraft(newDraft());
    store.clear().catch(() => {
      setSaveState("failed");
    });
  }

  return (
    <div className="admin editor">
      <header className="admin-head">
        <strong>Theme package editor</strong>
        <span className="tag">development only</span>
      </header>
      <Actions
        draft={draft}
        onChange={setDraft}
        onNew={startNew}
        saveState={saveState}
        report={report}
        setReport={setReport}
      />
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
              <small className="hint">
                1–60 characters. The file is downloaded as the name in lower case, with hyphens.
              </small>
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
