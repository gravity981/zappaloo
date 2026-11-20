// The screen for every error nobody planned for (WEB-13, WEB-14; UX mock `app-error`): shown by the
// router's `errorElement` and by an error boundary around the whole app, so neither the router's nor
// the browser's error page appears. It stands on its own: no router, session or event is needed, as
// those may be what failed. Nothing is sent anywhere; the guest copies the details if they want to.
import "./ui.css";
import { Component, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useRouteError } from "react-router";
import { versionResponseSchema } from "@zappaloo/shared";
import { buildErrorDetails, detailsAsText } from "./errorDetails.ts";

/** The commit of the running server, as far as it can be reached right now; the screen does not wait for it. */
function useCommit(): string | undefined {
  const [commit, setCommit] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/version", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        setCommit(versionResponseSchema.parse(body).commit);
      })
      .catch(() => {
        // The details say "unknown" then.
      });
    return () => {
      controller.abort();
    };
  }, []);
  return commit;
}

export function ErrorScreen({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const commit = useCommit();
  const [copied, setCopied] = useState(false);
  // Built once per error and page; the commit joins when it arrives.
  const details = useMemo(
    () =>
      buildErrorDetails(error, {
        path: window.location.pathname,
        now: new Date(),
        version: __APP_VERSION__,
        userAgent: navigator.userAgent,
        ...(commit !== undefined && { commit }),
      }),
    [error, commit],
  );
  const dev = import.meta.env.DEV;

  useEffect(() => {
    // For the developer, and for whoever has the console open anyway.
    console.error(error);
  }, [error]);

  const labels = {
    number: t("error.number"),
    message: t("error.message"),
    page: t("error.page"),
    time: t("error.time"),
    version: t("error.version"),
    browser: t("error.browser"),
  };
  const rows: [string, string][] = [
    [labels.number, details.number],
    [labels.message, details.message],
    [labels.page, details.page],
    [labels.time, `${details.time} (UTC)`],
    [labels.version, `${details.version} (${details.commit})`],
    [labels.browser, details.browser],
  ];
  const module = details.kind === "module";

  const copy = () => {
    navigator.clipboard.writeText(detailsAsText(details, labels)).then(
      () => {
        setCopied(true);
      },
      () => {
        // No clipboard (an old browser, an insecure page): the details can still be selected.
      },
    );
  };

  return (
    <div className="guest guest-bare themed" data-testid="app-error">
      <span className="guest-bare-brand">
        <b>{t("app.name")}</b>
      </span>
      <main className="guest-bare-inner">
        {dev && (
          <div className="card flat sm">
            <b>{t("error.devTitle")}</b> {t("error.devText")}
          </div>
        )}
        <div className="card flat err-message" role="alert">
          <div className="avatar" aria-hidden="true">
            !
          </div>
          <h1 className="h1">{module ? t("error.moduleTitle") : t("error.title")}</h1>
          <p className="muted">{module ? t("error.moduleText") : t("error.text")}</p>
        </div>
        <button
          type="button"
          className="btn block"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t("error.reload")}
        </button>
        {/* A full load on purpose: the router or the providers may be what failed. */}
        <a className="btn soft block" href="/">
          {t("error.home")}
        </a>
        <details className="err-details" open={dev}>
          <summary>{t("error.details")}</summary>
          <div className="err-kv">
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <span className="muted sm">{label}</span>
                <span className="err-val">{value}</span>
              </div>
            ))}
          </div>
          <pre className="err-pre">{details.stack}</pre>
          <div className="err-copy">
            <button type="button" className="btn soft sm" onClick={copy}>
              {t("error.copy")}
            </button>
            <span className="muted sm" role="status">
              {copied ? t("error.copied") : t("error.noPersonalData")}
              {dev && ` ${t("error.inConsole")}`}
            </span>
          </div>
        </details>
      </main>
    </div>
  );
}

/** The `errorElement` of the routes: the error the router caught. */
export function RouteErrorScreen() {
  return <ErrorScreen error={useRouteError()} />;
}

/** Around the whole app: what the router's own error element does not catch (the router itself, the providers). */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error?: { value: unknown } }
> {
  override state: { error?: { value: unknown } } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error: { value: error } };
  }

  override render() {
    return this.state.error ? <ErrorScreen error={this.state.error.value} /> : this.props.children;
  }
}
