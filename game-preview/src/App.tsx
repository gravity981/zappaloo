import {
  createGame,
  setGameGuides,
  setGameSelection,
  setGameView,
  type GameGuides,
  type GameInstance,
  type GameSelection,
  type GameStateReader,
  type GameView,
} from "@zappaloo/game-engine";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { loadPreviewPackage, PreviewLoadError, releasePreviewPackage } from "./package-loader.ts";
import type { LoadedPreview } from "./package-loader.ts";

const INITIAL_GUIDES: GameGuides = {
  collisions: false,
  borders: false,
  spawns: false,
  portals: false,
  occlusion: false,
  grid: false,
};

const INITIAL_VIEW: GameView = { artworkOnly: false, zoom: 2 };

interface PendingPreview {
  preview: LoadedPreview;
  stage: HTMLDivElement;
  game?: GameInstance;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function destroyPreview(preview: LoadedPreview, game: GameInstance, stage: HTMLDivElement): void {
  game.destroy(true);
  stage.remove();
  preview.releaseAssets();
  void releasePreviewPackage(preview.token).catch((error: unknown) => {
    console.error("Could not release a replaced preview package", error);
  });
}

export default function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const active = useRef<LoadedPreview | null>(null);
  const activeGame = useRef<GameInstance | null>(null);
  const activeStage = useRef<HTMLDivElement | null>(null);
  const pending = useRef<PendingPreview | null>(null);
  const isMounted = useRef(false);
  const selection = useRef<GameSelection | null>(null);
  const guides = useRef<GameGuides>(INITIAL_GUIDES);
  const view = useRef<GameView>(INITIAL_VIEW);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{
    message: string;
    findings: PreviewLoadError["findings"];
  }>();
  const [current, setCurrent] = useState<LoadedPreview | null>(null);
  const [currentSelection, setCurrentSelection] = useState<GameSelection | null>(null);
  const [currentGuides, setCurrentGuides] = useState<GameGuides>(INITIAL_GUIDES);
  const [currentView, setCurrentView] = useState<GameView>(INITIAL_VIEW);
  const [readState, setReadState] = useState<GameStateReader | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      const activePreview = active.current;
      const game = activeGame.current;
      const stage = activeStage.current;
      if (activePreview !== null && game !== null && stage !== null) {
        destroyPreview(activePreview, game, stage);
      }
      const candidate = pending.current;
      if (candidate?.game !== undefined) candidate.game.destroy(true);
      candidate?.stage.remove();
      candidate?.preview.releaseAssets();
      pending.current = null;
      if (candidate !== null) {
        void releasePreviewPackage(candidate.preview.token).catch((error: unknown) => {
          console.error("Could not release a pending preview package", error);
        });
      }
    };
  }, []);

  async function loadFile(file: File): Promise<void> {
    const pageIsMounted = (): boolean => isMounted.current;
    setLoading(true);
    setLoadError(undefined);
    let preview: LoadedPreview | undefined;
    let candidate: PendingPreview | undefined;
    let timeout: number | undefined;
    try {
      const loadedPreview = await loadPreviewPackage(file);
      preview = loadedPreview;
      if (!pageIsMounted()) {
        loadedPreview.releaseAssets();
        await releasePreviewPackage(loadedPreview.token);
        return;
      }
      const parent = viewport.current;
      if (parent === null) throw new Error("The preview viewport is not available");

      const stage = document.createElement("div");
      stage.className = "preview-stage";
      stage.style.visibility = "hidden";
      parent.append(stage);
      candidate = { preview: loadedPreview, stage };
      pending.current = candidate;

      let candidateState: GameStateReader | null = null;
      let resolveReady: (() => void) | undefined;
      let rejectReady: ((error: Error) => void) | undefined;
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      timeout = window.setTimeout(() => {
        rejectReady?.(new Error("The game engine did not finish loading the package"));
      }, 15_000);
      const startingSelection: GameSelection = {
        mapId: loadedPreview.world.startMap,
        spawn: "start",
        ...(loadedPreview.world.figures[0] === undefined
          ? {}
          : { figureId: loadedPreview.world.figures[0].id }),
      };
      const game = createGame({
        parent: stage,
        world: loadedPreview.world,
        host: {
          selection: startingSelection,
          onStateChange: (reader) => {
            candidateState = reader;
            if (active.current?.token === loadedPreview.token) {
              setReadState(reader === null ? null : () => reader);
            }
          },
          onReady: () => resolveReady?.(),
        },
        transparent: true,
        guides: guides.current,
        view: view.current,
      });
      candidate.game = game;
      await ready;
      window.clearTimeout(timeout);
      timeout = undefined;
      if (!pageIsMounted()) throw new Error("The preview page was closed while loading");

      const previousPreview = active.current;
      const previousGame = activeGame.current;
      const previousStage = activeStage.current;
      stage.style.visibility = "visible";
      active.current = loadedPreview;
      activeGame.current = game;
      activeStage.current = stage;
      selection.current = startingSelection;
      pending.current = null;
      setCurrent(loadedPreview);
      setCurrentSelection(startingSelection);
      setReadState(() => candidateState);
      setLoadError(undefined);
      if (previousPreview !== null && previousGame !== null && previousStage !== null) {
        destroyPreview(previousPreview, previousGame, previousStage);
      }
    } catch (error) {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (candidate !== undefined) {
        candidate.game?.destroy(true);
        candidate.stage.remove();
        if (pending.current === candidate) pending.current = null;
      }
      if (preview !== undefined) {
        preview.releaseAssets();
        try {
          await releasePreviewPackage(preview.token);
        } catch (releaseError) {
          console.error("Could not release a failed preview package", releaseError);
        }
      }
      const message = describeError(error);
      const findings = error instanceof PreviewLoadError ? error.findings : [];
      if (isMounted.current) setLoadError({ message, findings });
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
    setSelectedFile(event.currentTarget.files?.[0] ?? null);
  }

  function updateSelection(next: GameSelection): void {
    selection.current = next;
    setCurrentSelection(next);
    const game = activeGame.current;
    if (game !== null) setGameSelection(game, next);
  }

  function updateGuides(next: GameGuides): void {
    guides.current = next;
    setCurrentGuides(next);
    const game = activeGame.current;
    if (game !== null) setGameGuides(game, next);
  }

  function updateView(next: GameView): void {
    view.current = next;
    setCurrentView(next);
    const game = activeGame.current;
    if (game !== null) setGameView(game, next);
  }

  const selectedMap =
    currentSelection === null ? undefined : current?.world.maps.get(currentSelection.mapId);
  const spawnOptions = selectedMap === undefined ? [] : [...selectedMap.spawns.keys()];

  return (
    <main className="preview-app">
      <header className="preview-header">
        <div>
          <p className="eyebrow">Developer tool</p>
          <h1>World preview</h1>
        </div>
        <p className="preview-state" role="status" aria-live="polite">
          {loading
            ? "Loading and validating package…"
            : current === null
              ? "No world package loaded"
              : `${current.summary.name} · ${current.world.maps.size} maps`}
        </p>
      </header>

      <section className="preview-toolbar" aria-label="World controls">
        <form
          className="package-picker"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedFile !== null) {
              const file = selectedFile;
              setSelectedFile(null);
              if (fileInput.current !== null) fileInput.current.value = "";
              void loadFile(file);
            }
          }}
        >
          <label>
            World package
            <input
              accept=".tar.gz,.tgz,application/gzip"
              aria-label="World package"
              onChange={chooseFile}
              ref={fileInput}
              type="file"
              disabled={loading}
            />
          </label>
          <button disabled={selectedFile === null || loading} type="submit">
            Load package
          </button>
          <button
            disabled={current === null || loading}
            onClick={() => {
              if (current !== null) void loadFile(current.file);
            }}
            type="button"
          >
            Reload
          </button>
        </form>

        <div className="selection-controls">
          <label>
            Map
            <select
              aria-label="Map"
              disabled={current === null || loading}
              onChange={(event) => {
                if (current === null || currentSelection === null) return;
                const nextMapId = event.currentTarget.value;
                const spawns = [...(current.world.maps.get(nextMapId)?.spawns.keys() ?? [])];
                const nextSpawn = spawns.includes("start") ? "start" : (spawns[0] ?? "start");
                updateSelection({ ...currentSelection, mapId: nextMapId, spawn: nextSpawn });
              }}
              value={currentSelection?.mapId ?? ""}
            >
              {current?.world.maps.size ? (
                [...current.world.maps.values()].map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))
              ) : (
                <option value="">—</option>
              )}
            </select>
          </label>
          <label>
            Spawn
            <select
              aria-label="Spawn"
              disabled={current === null || loading}
              onChange={(event) => {
                if (currentSelection !== null)
                  updateSelection({ ...currentSelection, spawn: event.currentTarget.value });
              }}
              value={currentSelection?.spawn ?? ""}
            >
              {spawnOptions.length ? (
                spawnOptions.map((spawn) => (
                  <option key={spawn} value={spawn}>
                    {spawn}
                  </option>
                ))
              ) : (
                <option value="start">start</option>
              )}
            </select>
          </label>
          <label>
            Figure
            <select
              aria-label="Figure"
              disabled={current === null || loading}
              onChange={(event) => {
                if (currentSelection !== null)
                  updateSelection({ ...currentSelection, figureId: event.currentTarget.value });
              }}
              value={currentSelection?.figureId ?? ""}
            >
              {current?.world.figures.map((figure) => (
                <option key={figure.id} value={figure.id}>
                  {figure.label ?? figure.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="guide-controls">
          <summary>Guides and view</summary>
          <div className="guide-options">
            {(
              [
                ["collisions", "Collision"],
                ["borders", "Border"],
                ["spawns", "Spawn"],
                ["portals", "Portal"],
                ["occlusion", "Occlusion"],
                ["grid", "Grid"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  checked={currentGuides[key]}
                  disabled={current === null || loading}
                  onChange={(event) => {
                    updateGuides({ ...currentGuides, [key]: event.currentTarget.checked });
                  }}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
            <label>
              <input
                checked={currentView.artworkOnly}
                disabled={current === null || loading}
                onChange={(event) => {
                  updateView({ ...currentView, artworkOnly: event.currentTarget.checked });
                }}
                type="checkbox"
              />
              Artwork only
            </label>
            <label>
              Zoom
              <select
                aria-label="Zoom"
                disabled={current === null || loading}
                onChange={(event) => {
                  updateView({ ...currentView, zoom: Number(event.currentTarget.value) });
                }}
                value={String(currentView.zoom)}
              >
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="3">3×</option>
              </select>
            </label>
            <button
              disabled={current === null || loading}
              onClick={() => {
                updateView({ ...view.current });
              }}
              type="button"
            >
              Reset camera
            </button>
          </div>
        </details>
      </section>

      {loadError !== undefined && (
        <section className="load-error" role="alert">
          <h2>Could not load package</h2>
          <p>{loadError.message}</p>
          {loadError.findings.length > 0 && (
            <ul>
              {loadError.findings.map((finding, index) => (
                <li key={`${finding.file}-${finding.code}-${String(index)}`}>
                  <strong>
                    {finding.severity}: {finding.file}
                  </strong>
                  {finding.object === undefined ? "" : ` › ${finding.object}`} — {finding.detail}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {current?.findings.some((finding) => finding.severity === "warning") === true && (
        <details className="package-warnings">
          <summary>Package warnings ({current.findings.length})</summary>
          <ul>
            {current.findings
              .filter((finding) => finding.severity === "warning")
              .map((finding, index) => (
                <li key={`${finding.file}-${finding.code}-${String(index)}`}>
                  {finding.file} — {finding.detail}
                </li>
              ))}
          </ul>
        </details>
      )}

      <section className="preview-viewport" aria-label="World canvas">
        <div ref={viewport} className="preview-game-container" />
        {current === null && (
          <p className="empty-world">
            Select a validated <code>.tar.gz</code> world package to preview it.
          </p>
        )}
      </section>
      <footer className="preview-footer">
        {readState?.() === undefined
          ? "Use the selectors to inspect maps, spawns and figures."
          : `Map ${readState().mapId} · ${readState().x}, ${readState().y} · zoom ${readState().view.zoom}×`}
        <button
          disabled={current === null || loading}
          onClick={() => {
            if (selection.current !== null) updateSelection({ ...selection.current });
          }}
          type="button"
        >
          Reset position
        </button>
      </footer>
    </main>
  );
}
