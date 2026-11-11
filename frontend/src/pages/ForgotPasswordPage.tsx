// Asks for a password-reset link by email (ACC-03; UX mock `forgot`). The answer is the same for
// every input, so it does not reveal which accounts exist.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import { BareShell } from "../guest/Shells.tsx";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await apiRequest("POST", "/api/password/forgot", {
      body: { identifier: fieldText(form, "identifier") },
    });
    setBusy(false);
    setError(result.ok ? undefined : (result.errorCode ?? "unknown"));
    setDone(result.ok);
  }

  if (done) {
    return (
      <BareShell>
        <div className="check" aria-hidden="true">
          ✉
        </div>
        <h1 className="h1" style={{ textAlign: "center" }}>
          {t("forgotPassword.doneTitle")}
        </h1>
        <p className="muted" style={{ textAlign: "center" }}>
          {t("forgotPassword.doneText")}
        </p>
        <div className="card flat sm">
          <b>{t("forgotPassword.noMailTitle")}</b>
          {t("forgotPassword.noEmail")}
        </div>
        <Link className="btn ghost block" to="/login">
          {t("forgotPassword.back")}
        </Link>
      </BareShell>
    );
  }
  return (
    <BareShell>
      <h1 className="h1">{t("forgotPassword.title")}</h1>
      <p className="muted">{t("forgotPassword.hint")}</p>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="forgot-identifier">
            <span>{t("forgotPassword.identifier")}</span>
          </label>
          <input
            id="forgot-identifier"
            className="input"
            name="identifier"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
          />
        </div>
        {error && (
          <p role="alert" className="error">
            {t(`errors.${error}`, { defaultValue: t("errors.unknown") })}
          </p>
        )}
        <button type="submit" className="btn block" disabled={busy}>
          {t("forgotPassword.submit")}
        </button>
      </form>
      <p className="hint">{t("forgotPassword.onlyVerified")}</p>
      <Link className="sm" to="/login">
        {t("forgotPassword.back")}
      </Link>
    </BareShell>
  );
}
