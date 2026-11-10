// Redeeming a personal invitation (INV-03, INV-07, ACC-07): a new guest creates an account,
// a signed-in user without vip adds vip to their account.
import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import {
  PASSWORD_MIN_LENGTH,
  invitationPreviewSchema,
  redeemResponseSchema,
} from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import { useSession } from "../app/session.ts";

type Preview = "loading" | { guestName: string } | { error: string };

function EnterCode() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = fieldText(new FormData(event.currentTarget), "code")
      .replace(/[\s-]/g, "")
      .toUpperCase();
    void navigate(`/invite/${encodeURIComponent(code)}`);
  }
  return (
    <section>
      <h1>{t("invite.title")}</h1>
      <p>{t("invite.enterHint")}</p>
      <form onSubmit={submit}>
        <label>
          {t("invite.code")}
          <input name="code" autoCapitalize="characters" autoComplete="off" required />
        </label>
        <button type="submit">{t("invite.next")}</button>
      </form>
    </section>
  );
}

function Redeem({ code }: { code: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview>("loading");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest("GET", `/api/invitations/${encodeURIComponent(code)}`)
      .then((result) => {
        const parsed = invitationPreviewSchema.safeParse(result.body);
        if (cancelled) return;
        setPreview(
          result.ok && parsed.success ? parsed.data : { error: result.errorCode ?? "unknown" },
        );
      })
      .catch(() => {
        if (!cancelled) setPreview({ error: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const errorText = (key: string) => t(`errors.${key}`, { defaultValue: t("errors.unknown") });

  if (preview === "loading" || !session.ready) return <p>{t("invite.checking")}</p>;
  if ("error" in preview) {
    return (
      <section>
        <h1>{t("invite.title")}</h1>
        <p role="alert">{errorText(preview.error)}</p>
        <Link to="/invite">{t("invite.tryAnother")}</Link>
      </section>
    );
  }
  const { guestName } = preview;

  async function register(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = fieldText(form, "password");
    if (password !== fieldText(form, "repeat")) {
      setError("passwords_differ");
      return;
    }
    const username = fieldText(form, "username").trim().toLowerCase();
    setBusy(true);
    const result = await apiRequest(
      "POST",
      `/api/invitations/${encodeURIComponent(code)}/register`,
      {
        body: { username, displayName: fieldText(form, "displayName"), password },
      },
    );
    if (!result.ok) {
      setBusy(false);
      setError(result.errorCode ?? "unknown");
      return;
    }
    const failed = await session.login(username, password);
    setBusy(false);
    if (failed) setError(failed);
    else void navigate("/", { replace: true });
  }

  async function redeem() {
    setBusy(true);
    const result = await apiRequest("POST", `/api/invitations/${encodeURIComponent(code)}/redeem`, {
      csrfToken: session.csrfToken,
    });
    setBusy(false);
    const parsed = redeemResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      session.setUser(parsed.data.user);
      void navigate("/", { replace: true });
    } else {
      setError(result.errorCode ?? "unknown");
    }
  }

  if (session.user) {
    const alreadyVip = session.user.roles.includes("vip");
    return (
      <section>
        <h1>{t("invite.welcome", { name: guestName })}</h1>
        {alreadyVip ? (
          <p>{t("invite.alreadyVip")}</p>
        ) : (
          <>
            <p>{t("invite.redeemHint", { user: session.user.displayName })}</p>
            {error && <p role="alert">{errorText(error)}</p>}
            <button type="button" disabled={busy} onClick={() => void redeem()}>
              {t("invite.redeem")}
            </button>
          </>
        )}
      </section>
    );
  }
  return (
    <section>
      <h1>{t("invite.welcome", { name: guestName })}</h1>
      <p>{t("invite.registerHint", { min: PASSWORD_MIN_LENGTH })}</p>
      <form onSubmit={(event) => void register(event)}>
        <label>
          {t("invite.username")}
          <input name="username" autoComplete="username" autoCapitalize="none" required />
        </label>
        <label>
          {t("invite.displayName")}
          <input name="displayName" defaultValue={guestName} required maxLength={100} />
        </label>
        <label>
          {t("setPassword.password")}
          <input name="password" type="password" autoComplete="new-password" required />
        </label>
        <label>
          {t("setPassword.repeat")}
          <input name="repeat" type="password" autoComplete="new-password" required />
        </label>
        {error && <p role="alert">{errorText(error)}</p>}
        <button type="submit" disabled={busy}>
          {t("invite.register")}
        </button>
      </form>
      <p>
        {t("invite.haveAccount")} <Link to="/login">{t("login.title")}</Link>
      </p>
    </section>
  );
}

export default function InvitePage() {
  const { code } = useParams();
  return code ? <Redeem code={code} /> : <EnterCode />;
}
