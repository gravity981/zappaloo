// Redeeming a personal invitation (INV-03, INV-07, ACC-07; UX mocks `invite-code` and
// `invite-register`): a code in six boxes, then a new guest creates an account, or a signed-in
// user without vip adds vip to their account. A code that cannot be used says why.
import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import {
  invitationPreviewSchema,
  PASSWORD_MIN_LENGTH,
  redeemResponseSchema,
} from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import { useSession } from "../app/session.ts";
import { CODE_LENGTH } from "../guest/code.ts";
import OtpInput from "../guest/OtpInput.tsx";
import PasswordField from "../guest/PasswordField.tsx";
import { BareShell } from "../guest/Shells.tsx";
import { suggestUsername } from "../guest/username.ts";

type Preview = "loading" | { guestName: string } | { error: string };

function EnterCode() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate(`/invite/${encodeURIComponent(code)}`);
  }
  return (
    <BareShell>
      <h1 className="h1">{t("invite.title")}</h1>
      <p className="muted">{t("invite.enterHint")}</p>
      <form className="stack" onSubmit={submit}>
        <OtpInput value={code} onChange={setCode} label={t("invite.code")} />
        <button type="submit" className="btn block" disabled={code.length !== CODE_LENGTH}>
          {t("invite.next")}
        </button>
      </form>
      <p className="hint">{t("invite.qrTip")}</p>
      <hr />
      <p className="sm">
        {t("invite.haveAccountShort")} <Link to="/login">{t("login.title")}</Link>
      </p>
    </BareShell>
  );
}

/** What is wrong with a code that cannot be redeemed: a card that says so, and the ways on. */
function CodeProblem({ error }: { error: string }) {
  const { t } = useTranslation();
  const kind =
    error === "invitation_redeemed"
      ? "redeemed"
      : ["invitation_expired", "invitation_revoked", "invitation_replaced"].includes(error)
        ? "expired"
        : "invalid";
  return (
    <BareShell>
      <div className="card flat notice">
        <div className="avatar" aria-hidden="true">
          ✉
        </div>
        <h1 className="h1" role="alert">
          {t(`invite.problem.${kind}.title`)}
        </h1>
        <p className="muted">
          {kind === "invalid" && error === "rate_limited"
            ? t("errors.rate_limited")
            : t(`invite.problem.${kind}.text`)}
        </p>
      </div>
      <Link className="btn block" to="/login">
        {t("login.title")}
      </Link>
      <Link className="btn ghost block" to="/invite">
        {t("invite.tryAnother")}
      </Link>
    </BareShell>
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

  if (preview === "loading" || !session.ready) {
    return (
      <BareShell>
        <p className="muted">{t("invite.checking")}</p>
      </BareShell>
    );
  }
  if ("error" in preview) return <CodeProblem error={preview.error} />;
  const { guestName } = preview;
  const shownCode = code.toUpperCase();

  async function register(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = fieldText(form, "password");
    const username = fieldText(form, "username").trim().toLowerCase();
    const email = fieldText(form, "email").trim();
    setBusy(true);
    const result = await apiRequest(
      "POST",
      `/api/invitations/${encodeURIComponent(code)}/register`,
      {
        body: {
          username,
          displayName: fieldText(form, "displayName"),
          password,
          ...(email === "" ? {} : { email }),
        },
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

  const invitation = (
    <div className="card flat invitation-line">
      <div className="avatar" aria-hidden="true">
        ✉
      </div>
      <div className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">{t("invite.personal")}</span>
        <b>{guestName}</b>
      </div>
      <span className="tag line code-tag">{shownCode}</span>
    </div>
  );

  if (session.user) {
    const alreadyVip = session.user.roles.includes("vip");
    return (
      <BareShell>
        {invitation}
        <h1 className="h1">{t("invite.welcome", { name: guestName })}</h1>
        {alreadyVip ? (
          <p className="muted">{t("invite.alreadyVip")}</p>
        ) : (
          <>
            <p className="muted">{t("invite.redeemHint", { user: session.user.displayName })}</p>
            {error && (
              <p role="alert" className="error">
                {errorText(error)}
              </p>
            )}
            <button
              type="button"
              className="btn block"
              disabled={busy}
              onClick={() => void redeem()}
            >
              {t("invite.redeem")}
            </button>
          </>
        )}
      </BareShell>
    );
  }
  return (
    <BareShell>
      {invitation}
      <h1 className="h1">{t("invite.welcome", { name: guestName })}</h1>
      <p className="muted">{t("invite.registerHint")}</p>
      <form className="stack" onSubmit={(event) => void register(event)}>
        <div className="field">
          <label htmlFor="reg-display">
            <span>{t("invite.displayName")}</span>
          </label>
          <input
            id="reg-display"
            className="input"
            name="displayName"
            type="text"
            autoComplete="name"
            defaultValue={guestName}
            required
            maxLength={100}
            aria-describedby="reg-display-hint"
          />
          <small id="reg-display-hint" className="hint">
            {t("invite.displayNameHint")}
          </small>
        </div>
        <div className="field">
          <label htmlFor="reg-username">
            <span>{t("invite.username")}</span>
          </label>
          <input
            id="reg-username"
            className="input"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={suggestUsername(guestName)}
            required
            aria-describedby="reg-username-hint"
          />
          <small id="reg-username-hint" className="hint">
            {t("invite.usernameHint")}
          </small>
        </div>
        <PasswordField
          label={t("setPassword.password")}
          hint={t("invite.passwordHint", { min: PASSWORD_MIN_LENGTH })}
          placeholder={t("invite.passwordPlaceholder", { min: PASSWORD_MIN_LENGTH })}
        />
        <div className="field">
          <label htmlFor="reg-email">
            <span>{t("invite.email")}</span>
          </label>
          <input
            id="reg-email"
            className="input"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            placeholder={t("invite.emailPlaceholder")}
            aria-describedby="reg-email-hint"
          />
          <small id="reg-email-hint" className="hint">
            {t("invite.emailHint")}
          </small>
        </div>
        {error && (
          <p role="alert" className="error">
            {errorText(error)}
          </p>
        )}
        <button type="submit" className="btn block" disabled={busy}>
          {t("invite.register")}
        </button>
      </form>
      <hr />
      <p className="sm">
        {t("invite.haveAccount")} <Link to="/login">{t("invite.loginAndRedeem")}</Link>
      </p>
    </BareShell>
  );
}

export default function InvitePage() {
  const { code } = useParams();
  return code ? <Redeem code={code} /> : <EnterCode />;
}
