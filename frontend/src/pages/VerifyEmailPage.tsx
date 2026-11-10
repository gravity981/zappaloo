// Confirms the email address with the link from the verification email (ACC-09).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { apiRequest } from "../app/api.ts";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const [state, setState] = useState<"working" | "done" | { error: string }>("working");

  useEffect(() => {
    let cancelled = false;
    apiRequest("POST", "/api/email/verify", { body: { token } })
      .then((result) => {
        if (!cancelled) setState(result.ok ? "done" : { error: result.errorCode ?? "unknown" });
      })
      .catch(() => {
        if (!cancelled) setState({ error: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "working") {
    return (
      <section>
        <h1>{t("verifyEmail.title")}</h1>
        <p>{t("verifyEmail.working")}</p>
      </section>
    );
  }
  if (state === "done") {
    return (
      <section>
        <h1>{t("verifyEmail.doneTitle")}</h1>
        <p>{t("verifyEmail.doneText")}</p>
        <Link to="/profile">{t("verifyEmail.toProfile")}</Link>
      </section>
    );
  }
  return (
    <section>
      <h1>{t("verifyEmail.title")}</h1>
      <p role="alert">{t(`errors.${state.error}`, { defaultValue: t("errors.unknown") })}</p>
      <Link to="/profile">{t("verifyEmail.toProfile")}</Link>
    </section>
  );
}
