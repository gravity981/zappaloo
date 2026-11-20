// Notices a new release and reloads the app once it is safe (PWA-06). Renders nothing.
import { useEffect, useState } from "react";
import {
  alreadyReloadedFor,
  fetchServerVersion,
  isNewRelease,
  rememberReloadFor,
  useUpdateAllowed,
} from "./updateCheck.ts";

export function UpdateWatcher() {
  /** The version of a newer release the server reported, until the app has reloaded for it. */
  const [newer, setNewer] = useState<string>();
  const allowed = useUpdateAllowed();

  // On start and whenever the app comes back to the foreground.
  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      void fetchServerVersion(controller.signal).then((server) => {
        if (server !== undefined && isNewRelease(__APP_VERSION__, server)) setNewer(server);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (newer === undefined || !allowed || alreadyReloadedFor(newer)) return;
    rememberReloadFor(newer);
    window.location.reload();
  }, [newer, allowed]);

  return null;
}
