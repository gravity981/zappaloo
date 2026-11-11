// Confirms the email address with the link from the verification email (ACC-09, ACC-16; UX mock
// `verify-email`). The address is confirmed with a button, not on opening the page: a link
// scanner of the mail provider, or React running effects twice in development, would otherwise
// use up the link.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { apiRequest } from "../app/api.ts";
import { BareShell } from "../guest/Shells.tsx";

type State = "ready" | "working" | "done" | { error: string };

/** The tick of the finished state. */
const CHECK = "\u2713";

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
        <div className="check" aria-hidden="true">
          {CHECK}
        </div>
        <h1 className="h1" style={{ textAlign: "center" }}>
          {t("verifyEmail.doneTitle")}
        </h1>
        <p className="muted" style={{ textAlign: "center" }}>
          {t("verifyEmail.doneText")}
        </p>
        <Link className="btn block" to="/profile">
          {t("verifyEmail.toProfile")}
        </Link>
      </BareShell>
    );
  }
  if (typeof state === "object") {
    const kind =
      state.error === "email_taken"
        ? "taken"
        : state.error === "invalid_link"
          ? "invalid"
          : "other";
    return (
      <BareShell>
        <div className="card flat notice">
          <div className="avatar" aria-hidden="true">
            ✉
          </div>
          <h1 className="h1" role="alert">
            {kind === "other" ? t("verifyEmail.title") : t(`verifyEmail.${kind}.title`)}
          </h1>
          <p className="muted">
            {kind === "other"
              ? t(`errors.${state.error}`, { defaultValue: t("errors.unknown") })
              : t(`verifyEmail.${kind}.text`)}
          </p>
        </div>
        <Link className="btn block" to="/profile">
          {t("verifyEmail.toProfile")}
        </Link>
      </BareShell>
    );
  }
  return (
    <BareShell>
      <div className="check" aria-hidden="true">
        ✉
      </div>
      <h1 className="h1" style={{ textAlign: "center" }}>
        {t("verifyEmail.title")}
      </h1>
      <p className="muted" style={{ textAlign: "center" }}>
        {t("verifyEmail.intro")}
      </p>
      <button
        type="button"
        className="btn block"
        disabled={state === "working"}
        onClick={() => void confirm()}
      >
        {state === "working" ? t("verifyEmail.working") : t("verifyEmail.confirm")}
      </button>
    </BareShell>
  );
}
