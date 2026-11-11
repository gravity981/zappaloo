// Sets the password with a one-time setup or reset link (ACC-14, ACC-15).
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { PASSWORD_MIN_LENGTH } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { BareShell } from "../guest/Shells.tsx";
import { fieldText } from "../app/forms.ts";

export default function SetPasswordPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = fieldText(form, "password");
    if (password !== fieldText(form, "repeat")) {
      setError("passwords_differ");
      return;
    }
    setBusy(true);
    const result = await apiRequest("POST", "/api/password/set", {
      body: { token, newPassword: password },
    });
    setBusy(false);
    setError(result.ok ? undefined : (result.errorCode ?? "unknown"));
    setDone(result.ok);
  }

  if (done) {
    return (
      <BareShell>
        <h1>{t("setPassword.doneTitle")}</h1>
        <p>{t("setPassword.doneText")}</p>
        <Link to="/login">{t("setPassword.toLogin")}</Link>
      </BareShell>
    );
  }
  return (
    <BareShell>
      <h1>{t("setPassword.title")}</h1>
      <p>{t("setPassword.hint", { min: PASSWORD_MIN_LENGTH })}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {t("setPassword.password")}
          <input name="password" type="password" autoComplete="new-password" required />
        </label>
        <label>
          {t("setPassword.repeat")}
          <input name="repeat" type="password" autoComplete="new-password" required />
        </label>
        {error && <p role="alert">{t(`errors.${error}`, { defaultValue: t("errors.unknown") })}</p>}
        <button type="submit" disabled={busy}>
          {t("setPassword.submit")}
        </button>
      </form>
    </BareShell>
  );
}
