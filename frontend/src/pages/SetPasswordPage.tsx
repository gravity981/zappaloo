// Sets the password with a one-time setup or reset link (ACC-14, ACC-15, ACC-10, ACC-03; UX
// mock `set-password`). The link is looked up first, so a dead link says so before anyone types
// a password, and a new account is greeted with its username. One password field with an eye
// button, no repeated field (UX decision 57).
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { PASSWORD_MIN_LENGTH, passwordLinkResponseSchema } from "@zappaloo/shared";
import { useAdminData } from "../admin/data.ts";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import PasswordField from "../guest/PasswordField.tsx";
import { BareShell } from "../guest/Shells.tsx";

/** The tick of the finished state. */
const CHECK = "\u2713";

export default function SetPasswordPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const { data: link, failed } = useAdminData(
    `/api/password/link/${encodeURIComponent(token)}`,
    passwordLinkResponseSchema,
  );
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await apiRequest("POST", "/api/password/set", {
      body: { token, newPassword: fieldText(form, "password") },
    });
    setBusy(false);
    setError(result.ok ? undefined : (result.errorCode ?? "unknown"));
    setDone(result.ok);
  }

  if (done) {
    return (
      <BareShell>
        <div className="check" aria-hidden="true">
          {CHECK}
        </div>
        <h1 className="h1" style={{ textAlign: "center" }}>
          {t("setPassword.doneTitle")}
        </h1>
        <p className="muted" style={{ textAlign: "center" }}>
          {t("setPassword.doneText")}
        </p>
        <Link className="btn block" to="/login">
          {t("setPassword.toLogin")}
        </Link>
      </BareShell>
    );
  }
  if (failed) {
    return (
      <BareShell>
        <div className="card flat notice">
          <div className="avatar" aria-hidden="true">
            ✉
          </div>
          <h1 className="h1" role="alert">
            {t("setPassword.invalidTitle")}
          </h1>
          <p className="muted">
            {failed === "invalid_link"
              ? t("setPassword.invalidText")
              : t(`errors.${failed}`, { defaultValue: t("errors.unknown") })}
          </p>
        </div>
        <Link className="btn block" to="/login">
          {t("setPassword.toLogin")}
        </Link>
      </BareShell>
    );
  }
  if (!link) return <BareShell>{null}</BareShell>;
  const setup = link.purpose === "setup";
  return (
    <BareShell>
      <h1 className="h1">{setup ? t("setPassword.titleSetup") : t("setPassword.titleReset")}</h1>
      <p className="muted">
        {setup
          ? t("setPassword.hintSetup", { username: link.username })
          : t("setPassword.hintReset")}
      </p>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <PasswordField
          label={t("setPassword.password")}
          hint={t("setPassword.passwordHint", { min: PASSWORD_MIN_LENGTH })}
          placeholder={t("setPassword.placeholder", { min: PASSWORD_MIN_LENGTH })}
          minLength={PASSWORD_MIN_LENGTH}
        />
        {error && (
          <p role="alert" className="error">
            {t(`errors.${error}`, { defaultValue: t("errors.unknown") })}
          </p>
        )}
        <button type="submit" className="btn block" disabled={busy}>
          {t("setPassword.submit")}
        </button>
      </form>
    </BareShell>
  );
}
