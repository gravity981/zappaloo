import {
  createGame,
  sampleGuests,
  setGameDiagnostics,
  setGamePaused,
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
import {
  loadPreviewPackage,
  loadPreviewSnapshot,
  PreviewLoadError,
  releasePreviewPackage,
  sourceStatusSchema,
} from "./package-loader.ts";
import type { LoadedPreview, SourceStatus } from "./package-loader.ts";
import { sceneIsStale, staleMessage } from "./stale-scene.ts";

const INITIAL_GUIDES: GameGuides = {
  collisions: false,
  borders: false,
  spawns: false,
  portals: false,
  grid: false,
  occlusion: false,
};

const INITIAL_VIEW: GameView = { artworkOnly: false, zoom: 2 };

interface PendingPreview {
  preview: LoadedPreview;
  stage: HTMLDivElement;
  game?: GameInstance;
}

/** A load that a newer load replaced; it is dropped without a message. */
class SupersededLoad extends Error {}

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
  const diagnostics = useRef(new URLSearchParams(window.location.search).get("debug") === "frames");
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
  const [showFrames, setShowFrames] = useState(diagnostics.current);
  const [currentView, setCurrentView] = useState<GameView>(INITIAL_VIEW);
  const [readState, setReadState] = useState<GameStateReader | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [sourceArchivePath, setSourceArchivePath] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceRequestError, setSourceRequestError] = useState<string>();
  const [selectionWarning, setSelectionWarning] = useState<string>();
  const loadedSourceRevision = useRef(0);
  /** The number of the newest load started; only that load may show its package (overlapping loads, MAP-18). */
  const loadNumber = useRef(0);
  const loadSnapshotRef = useRef<(snapshot: unknown) => void>(() => undefined);

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

  // While a changed package is validated or loaded, the scene on show is paused and greyed out (MAP-18).
  const validating = sourceStatus?.loading === true;
  const stale = sceneIsStale({ hasScene: current !== null, loading, validating });
  useEffect(() => {
    const game = activeGame.current;
    if (game !== null) setGamePaused(game, stale);
  }, [stale]);

  async function loadPreview(load: () => Promise<LoadedPreview>): Promise<void> {
    const pageIsMounted = (): boolean => isMounted.current;
    loadNumber.current += 1;
    const number = loadNumber.current;
    const isLatest = (): boolean => loadNumber.current === number;
    setLoading(true);
    setLoadError(undefined);
    let preview: LoadedPreview | undefined;
    let candidate: PendingPreview | undefined;
    let timeout: number | undefined;
    try {
      const loadedPreview = await load();
      preview = loadedPreview;
      if (!pageIsMounted() || !isLatest()) {
        loadedPreview.releaseAssets();
        // A superseded local package stays: the newer load of the same snapshot may still read its files.
        const shared = loadedPreview.source === "local-package" && pageIsMounted();
        if (!shared) await releasePreviewPackage(loadedPreview.token);
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
      const previousSelection = selection.current;
      const previousMap =
        previousSelection === null
          ? undefined
          : loadedPreview.world.maps.get(previousSelection.mapId);
      const nextMap = previousMap ?? loadedPreview.world.maps.get(loadedPreview.world.startMap);
      const spawnOptions = [...(nextMap?.spawns.keys() ?? [])];
      const nextSpawn =
        previousMap !== undefined &&
        previousSelection !== null &&
        spawnOptions.includes(previousSelection.spawn)
          ? previousSelection.spawn
          : spawnOptions.includes("start")
            ? "start"
            : (spawnOptions[0] ?? "start");
      const figureIds = new Set(loadedPreview.world.figures.map((figure) => figure.id));
      const previousFigure =
        previousSelection?.figureId !== undefined && figureIds.has(previousSelection.figureId)
          ? previousSelection.figureId
          : loadedPreview.world.figures[0]?.id;
      const startingSelection: GameSelection = {
        mapId: nextMap?.id ?? loadedPreview.world.startMap,
        spawn: nextSpawn,
        ...(previousFigure === undefined ? {} : { figureId: previousFigure }),
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
        diagnostics: diagnostics.current,
        // The preview cannot assign actions, so it shows an indicator for every clickable object (GAME-26).
        // It has no guests either: sample figures show the wander areas (PRES-02).
        guests: sampleGuests(loadedPreview.world),
        texts: {
          loading: "Loading…",
          closeBubble: "Close speech bubble",
          defaultGreeting: "Hello 🙂",
        },
        guides: guides.current,
        view: view.current,
      });
      candidate.game = game;
      await ready;
      window.clearTimeout(timeout);
      timeout = undefined;
      if (!pageIsMounted()) throw new Error("The preview page was closed while loading");
      if (!isLatest()) throw new SupersededLoad();

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
      const lostSelections: string[] = [];
      if (previousSelection !== null) {
        if (previousMap === undefined) lostSelections.push(`map "${previousSelection.mapId}"`);
        else if (!spawnOptions.includes(previousSelection.spawn)) {
          lostSelections.push(`spawn "${previousSelection.spawn}"`);
        }
        if (
          previousSelection.figureId !== undefined &&
          !figureIds.has(previousSelection.figureId)
        ) {
          lostSelections.push(`figure "${previousSelection.figureId}"`);
        }
      }
      setSelectionWarning(
        lostSelections.length > 0
          ? `The previous ${lostSelections.join(", ")} is not available in this preview; a valid selection was chosen.`
          : undefined,
      );
      if (previousPreview !== null && previousGame !== null && previousStage !== null) {
        destroyPreview(previousPreview, previousGame, previousStage);
      }
    } catch (error) {
      if (timeout !== undefined) window.clearTimeout(timeout);
      // A load that a newer one replaced shows nothing: the newer load decides what the page shows.
      const superseded = error instanceof SupersededLoad;
      if (candidate !== undefined) {
        candidate.game?.destroy(true);
        candidate.stage.remove();
        if (pending.current === candidate) pending.current = null;
      }
      if (preview !== undefined) {
        preview.releaseAssets();
        // A local package's token is the preview server's own snapshot, which a newer load may still read.
        const shared = preview.source === "local-package" && superseded;
        try {
          if (!shared) await releasePreviewPackage(preview.token);
        } catch (releaseError) {
          console.error("Could not release a failed preview package", releaseError);
        }
      }
      const message = describeError(error);
      const findings = error instanceof PreviewLoadError ? error.findings : [];
      if (isMounted.current && !superseded) setLoadError({ message, findings });
    } finally {
      if (isMounted.current && isLatest()) setLoading(false);
    }
  }

  async function loadFile(file: File | undefined): Promise<void> {
    if (file === undefined) {
      setLoadError({ message: "The current package file is no longer available.", findings: [] });
      return;
    }
    if (sourceStatus?.active === true) {
      try {
        const response = await fetch("/__game-preview/api/local-package/stop", { method: "POST" });
        if (!response.ok) throw new Error(`The preview server answered ${String(response.status)}`);
        setSourceStatus(sourceStatusSchema.parse(await response.json()));
      } catch (error) {
        setSourceRequestError(`Could not stop local package watching: ${describeError(error)}`);
        return;
      }
    }
    await loadPreview(() => loadPreviewPackage(file));
  }

  async function loadSourceSnapshot(snapshot: unknown): Promise<void> {
    await loadPreview(() => loadPreviewSnapshot(snapshot, "local-package"));
  }

  loadSnapshotRef.current = (snapshot) => {
    void loadSourceSnapshot(snapshot);
  };

  useEffect(() => {
    let disposed = false;
    let polling = false;
    const poll = async (): Promise<void> => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch("/__game-preview/api/local-package/status");
        if (!response.ok) throw new Error(`The preview server answered ${String(response.status)}`);
        const status = sourceStatusSchema.parse(await response.json());
        if (disposed) return;
        setSourceStatus(status);
        setSourceRequestError(undefined);
        if (status.active && status.archivePath !== undefined) {
          setSourceArchivePath(status.archivePath);
        }
        if (
          status.active &&
          status.snapshot !== undefined &&
          status.revision > loadedSourceRevision.current
        ) {
          loadedSourceRevision.current = status.revision;
          loadSnapshotRef.current(status.snapshot);
        }
      } catch (error) {
        if (!disposed) setSourceRequestError(describeError(error));
      } finally {
        polling = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 750);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  async function startSourcePreview(): Promise<void> {
    const archivePath = sourceArchivePath.trim();
    if (!archivePath.startsWith("/")) return;
    setSourceBusy(true);
    setSourceRequestError(undefined);
    try {
      const response = await fetch("/__game-preview/api/local-package/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivePath }),
      });
      if (!response.ok) throw new Error(`The preview server answered ${String(response.status)}`);
      const status = sourceStatusSchema.parse(await response.json());
      setSourceStatus(status);
      if (status.snapshot !== undefined && status.revision > loadedSourceRevision.current) {
        loadedSourceRevision.current = status.revision;
        await loadSourceSnapshot(status.snapshot);
      }
    } catch (error) {
      setSourceRequestError(`Could not start local package preview: ${describeError(error)}`);
    } finally {
      setSourceBusy(false);
    }
  }

  async function stopSourcePreview(): Promise<void> {
    setSourceBusy(true);
    setSourceRequestError(undefined);
    try {
      const response = await fetch("/__game-preview/api/local-package/stop", { method: "POST" });
      if (!response.ok) throw new Error(`The preview server answered ${String(response.status)}`);
      setSourceStatus(sourceStatusSchema.parse(await response.json()));
    } catch (error) {
      setSourceRequestError(`Could not stop local package watching: ${describeError(error)}`);
    } finally {
      setSourceBusy(false);
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

  function updateDiagnostics(on: boolean): void {
    diagnostics.current = on;
    setShowFrames(on);
    const game = activeGame.current;
    if (game !== null) setGameDiagnostics(game, on);
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
            ? "Loading and validating world…"
            : current === null
              ? "No world loaded"
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
            disabled={current === null || loading || sourceBusy}
            onClick={() => {
              if (current === null) return;
              if (current.source === "local-package") {
                void startSourcePreview();
                return;
              }
              void loadFile(current.file);
            }}
            type="button"
          >
            {current?.source === "local-package" ? "Reload watched package" : "Reload"}
          </button>
        </form>

        <section className="local-package-controls" aria-labelledby="source-preview-heading">
          <div>
            <h2 id="source-preview-heading">Local world package</h2>
            <p role="status" aria-live="polite">
              {sourceStatus?.active
                ? `Watching ${sourceStatus.archivePath ?? "world package"} for changes.`
                : "Enter the absolute path to a world package archive in the preview server environment."}
            </p>
            {sourceStatus?.active === true && (
              <p>
                Watching package changes
                {sourceStatus.loading ? " · validating…" : ""}
              </p>
            )}
          </div>
          <div className="local-package-actions">
            <label>
              Absolute package path
              <input
                aria-label="Local world package path"
                autoComplete="off"
                disabled={sourceStatus?.active === true || loading || sourceBusy}
                onChange={(event) => {
                  setSourceArchivePath(event.currentTarget.value);
                }}
                placeholder="/workspaces/hz-event-assets/world.tar.gz"
                spellCheck={false}
                type="text"
                value={sourceArchivePath}
              />
            </label>
            <button
              disabled={
                !sourceArchivePath.trim().startsWith("/") ||
                loading ||
                sourceBusy ||
                sourceStatus?.active === true
              }
              onClick={() => {
                void startSourcePreview();
              }}
              type="button"
            >
              Preview and watch
            </button>
            {sourceStatus?.active === true && (
              <button
                disabled={sourceBusy}
                onClick={() => {
                  void stopSourcePreview();
                }}
                type="button"
              >
                Stop watching
              </button>
            )}
          </div>
          {sourceRequestError !== undefined && (
            <p className="source-error" role="alert">
              {sourceRequestError}
            </p>
          )}
          {sourceStatus?.error !== undefined && (
            <div className="source-error" role="alert">
              <p>{sourceStatus.error.message}</p>
              {sourceStatus.error.findings.length > 0 && (
                <ul>
                  {sourceStatus.error.findings.map((finding, index) => (
                    <li key={`${finding.file}-${finding.code}-${String(index)}`}>
                      <strong>
                        {finding.severity}: {finding.file}
                      </strong>
                      {finding.object === undefined ? "" : ` › ${finding.object}`} —{" "}
                      {finding.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

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
                ["grid", "Grid"],
                ["occlusion", "Occlusion debug"],
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
            {currentGuides.occlusion && (
              <small className="guide-legend">
                Cyan: occlusion lines · white: vertices · yellow: player occlusion segment and its
                guide intersections · green/red: majority front/behind
              </small>
            )}
            {currentGuides.collisions && (
              <small className="guide-legend">
                Red: blocked areas · orange ellipse: player collision footprint · white: ellipse
                center
              </small>
            )}
            <label>
              <input
                checked={showFrames}
                onChange={(event) => {
                  updateDiagnostics(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              Frame rate and canvas
            </label>
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
          <h2>Could not load preview</h2>
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

      {selectionWarning !== undefined && (
        <p className="selection-warning" role="status">
          {selectionWarning}
        </p>
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
        {stale && (
          <div className="preview-stale" role="status">
            <span>{staleMessage({ loading })}</span>
          </div>
        )}
        {current === null && (
          <p className="empty-world">
            Load a validated <code>.tar.gz</code> world package or enter an absolute local package
            path to preview and watch it.
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
