// Asks for a password-reset link by email (ACC-03). The answer is the same for every
// input, so it does not reveal which accounts exist.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";

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
      <section>
        <h1>{t("forgotPassword.doneTitle")}</h1>
        <p>{t("forgotPassword.doneText")}</p>
        <p>{t("forgotPassword.noEmail")}</p>
        <Link to="/login">{t("forgotPassword.back")}</Link>
      </section>
    );
  }
  return (
    <section>
      <h1>{t("forgotPassword.title")}</h1>
      <p>{t("forgotPassword.hint")}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {t("forgotPassword.identifier")}
          <input name="identifier" autoCapitalize="none" required maxLength={254} />
        </label>
        {error && <p role="alert">{t(`errors.${error}`, { defaultValue: t("errors.unknown") })}</p>}
        <button type="submit" disabled={busy}>
          {t("forgotPassword.submit")}
        </button>
      </form>
      <p>{t("forgotPassword.noEmail")}</p>
    </section>
  );
}
