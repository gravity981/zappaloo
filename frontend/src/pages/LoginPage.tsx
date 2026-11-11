import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router";
import { fieldText } from "../app/forms.ts";
import { useSession } from "../app/session.ts";

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
    <section>
      <h1>{t("login.title")}</h1>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {t("login.username")}
          <input name="username" autoComplete="username" required autoCapitalize="none" />
        </label>
        <label>
          {t("login.password")}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert">{t(`errors.${error}`, { defaultValue: t("errors.unknown") })}</p>}
        <button type="submit" disabled={busy}>
          {t("login.submit")}
        </button>
      </form>
      <p>
        <Link to="/forgot-password">{t("login.forgot")}</Link>
      </p>
    </section>
  );
}
