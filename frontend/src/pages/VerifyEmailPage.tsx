// Confirms the email address with the link from the verification email (ACC-09). The
// address is confirmed with a button, not on opening the page: a link scanner of the mail
// provider, or React running effects twice in development, would otherwise use up the link.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { apiRequest } from "../app/api.ts";
import { BareShell } from "../guest/Shells.tsx";

type State = "ready" | "working" | "done" | { error: string };

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const [state, setState] = useState<State>("ready");

  const confirm = async () => {
    setState("working");
    const result = await apiRequest("POST", "/api/email/verify", { body: { token } });
    setState(result.ok ? "done" : { error: result.errorCode ?? "unknown" });
  };

  if (state === "done") {
    return (
      <BareShell>
        <h1>{t("verifyEmail.doneTitle")}</h1>
        <p>{t("verifyEmail.doneText")}</p>
        <Link to="/profile">{t("verifyEmail.toProfile")}</Link>
      </BareShell>
    );
  }
  if (typeof state === "object") {
    return (
      <BareShell>
        <h1>{t("verifyEmail.title")}</h1>
        <p role="alert">{t(`errors.${state.error}`, { defaultValue: t("errors.unknown") })}</p>
        <Link to="/profile">{t("verifyEmail.toProfile")}</Link>
      </BareShell>
    );
  }
  return (
    <BareShell>
      <h1>{t("verifyEmail.title")}</h1>
      <p>{t("verifyEmail.intro")}</p>
      <button type="button" disabled={state === "working"} onClick={() => void confirm()}>
        {state === "working" ? t("verifyEmail.working") : t("verifyEmail.confirm")}
      </button>
    </BareShell>
  );
}
