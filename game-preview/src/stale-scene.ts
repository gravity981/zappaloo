// While a changed package is being validated or loaded, the scene on show is out of date: it is paused and greyed out
// until the new one replaces it (MAP-18). A first load has no scene on show, so there is nothing to grey out.

export interface StaleInput {
  /** A scene is on show. */
  hasScene: boolean;
  /** The page is loading a package. */
  loading: boolean;
  /** The server is validating a package that changed. */
  validating: boolean;
}

/** Whether the scene on show is out of date, so that it is paused and greyed out. */
export function sceneIsStale({ hasScene, loading, validating }: StaleInput): boolean {
  return hasScene && (loading || validating);
}

/** What the overlay says: the server validates first, then the page loads the package. */
export function staleMessage({ loading }: Pick<StaleInput, "loading">): string {
  return loading ? "Loading the changed package…" : "The package changed, validating it…";
}
