// Sign-in (ACC-01, ACC-16; UX mock `login`): username or verified email address and password,
// with the ways to reset a forgotten password, to redeem an invitation and to the privacy notice.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router";
import { fieldText } from "../app/forms.ts";
import { useSession } from "../app/session.ts";
import { BareShell } from "../guest/Shells.tsx";

export default function LoginPage() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (session.user) {
    // Back to where the visitor wanted to go (RequireSignIn), else the start page.
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={typeof from === "string" && from.startsWith("/") ? from : "/"} replace />;
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const code = await session.login(fieldText(form, "username"), fieldText(form, "password"));
    setBusy(false);
    setError(code);
  }

  return (
    <BareShell>
      <h1 className="h1">{t("login.title")}</h1>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="login-username">
            <span>{t("login.username")}</span>
          </label>
          <input
            id="login-username"
            className="input"
            name="username"
            type="text"
            autoComplete="username"
            required
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="login-username-hint"
          />
          <small id="login-username-hint" className="hint">
            {t("login.usernameHint")}
          </small>
        </div>
        <div className="field">
          <label htmlFor="login-password">
            <span>{t("login.password")}</span>
          </label>
          <input
            id="login-password"
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error && (
          <p role="alert" className="error">
            {t(`errors.${error}`, { defaultValue: t("errors.unknown") })}
          </p>
        )}
        <button type="submit" className="btn block" disabled={busy}>
          {t("login.submit")}
        </button>
      </form>
      <Link className="sm" to="/forgot-password">
        {t("login.forgot")}
      </Link>
      <hr />
      <div className="card flat">
        <b>{t("login.noAccountTitle")}</b>
        <span className="muted sm">{t("login.noAccountText")}</span>
        <Link className="btn ghost sm" to="/invite">
          {t("login.redeem")}
        </Link>
      </div>
    </BareShell>
  );
}
