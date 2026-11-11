// The user's profile: display name, email and password (ACC-04, ACC-06).
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router";
import { PASSWORD_MIN_LENGTH, userSchema } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import { useInstall } from "../app/install.ts";
import { useSession } from "../app/session.ts";

export default function ProfilePage() {
  const { t } = useTranslation();
  const session = useSession();
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string }>();
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string }>();
  const [verifyMessage, setVerifyMessage] = useState<{ ok: boolean; text: string }>();
  const [deleteMessage, setDeleteMessage] = useState<string>();
  const { available: canInstall } = useInstall();
  /** The second step of changing the password and of deleting the account. */
  const [panel, setPanel] = useState<"password" | "delete">();

  if (!session.ready) return null;
  if (!session.user) return <Navigate to="/login" replace />;
  const user = session.user;

  async function saveProfile(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = fieldText(form, "email").trim();
    const result = await apiRequest("PATCH", "/api/profile", {
      csrfToken: session.csrfToken,
      body: { displayName: fieldText(form, "displayName"), email: email === "" ? null : email },
    });
    const parsed = userSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      session.setUser(parsed.data);
      setProfileMessage({ ok: true, text: t("profile.saved") });
    } else {
      const code = result.errorCode ?? "unknown";
      setProfileMessage({
        ok: false,
        text: t(`errors.${code}`, { defaultValue: t("errors.unknown") }),
      });
    }
  }

  async function changePassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await apiRequest("POST", "/api/profile/password", {
      csrfToken: session.csrfToken,
      body: {
        currentPassword: fieldText(form, "currentPassword"),
        newPassword: fieldText(form, "newPassword"),
      },
    });
    if (result.ok) {
      formElement.reset();
      setPasswordMessage({ ok: true, text: t("profile.passwordChanged") });
    } else {
      const code = result.errorCode ?? "unknown";
      setPasswordMessage({
        ok: false,
        text: t(`errors.${code}`, { defaultValue: t("errors.unknown") }),
      });
    }
  }

  const errorText = (code: string | undefined) =>
    t(`errors.${code ?? "unknown"}`, { defaultValue: t("errors.unknown") });

  async function sendVerification() {
    const result = await apiRequest("POST", "/api/profile/email/verify", {
      csrfToken: session.csrfToken,
    });
    setVerifyMessage(
      result.ok
        ? { ok: true, text: t("profile.verifySent") }
        : { ok: false, text: errorText(result.errorCode) },
    );
  }

  async function deleteAccount(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await apiRequest("DELETE", "/api/profile", {
      csrfToken: session.csrfToken,
      body: { password: fieldText(form, "deletePassword") },
    });
    if (result.ok) {
      session.clear();
    } else {
      setDeleteMessage(errorText(result.errorCode));
    }
  }

  return (
    <div className="stack">
      <h1 className="h1">{t("profile.title")}</h1>
      <div className="grid-2">
        <section className="card" aria-labelledby="profile-card">
          <b id="profile-card">{t("profile.cardProfile")}</b>
          <form className="stack" onSubmit={(event) => void saveProfile(event)}>
            <div className="field">
              <label htmlFor="profile-name">
                <span>{t("profile.displayName")}</span>
              </label>
              <input
                id="profile-name"
                className="input"
                name="displayName"
                defaultValue={user.displayName}
                required
                maxLength={100}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-email">
                <span>{t("profile.email")}</span>
              </label>
              <input
                id="profile-email"
                className="input"
                name="email"
                type="email"
                defaultValue={user.email ?? ""}
                maxLength={254}
              />
            </div>
            {profileMessage && (
              <p
                role={profileMessage.ok ? "status" : "alert"}
                className={profileMessage.ok ? "hint" : "error"}
              >
                {profileMessage.text}
              </p>
            )}
            <button type="submit" className="btn soft sm">
              {t("profile.save")}
            </button>
          </form>
        </section>

        {canInstall && (
          <section className="card" aria-labelledby="app-card">
            <b id="app-card">{t("install.cardTitle")}</b>
            <span className="hint">{t("install.cardText")}</span>
            <Link className="btn soft sm" to="/install">
              {t("install.cardButton")}
            </Link>
          </section>
        )}
        <section className="card" aria-labelledby="account-card">
          <b id="account-card">{t("profile.accountTitle")}</b>
          <ul className="list">
            <li className="li">
              <div className="grow">
                <span className="hint">{t("profile.usernameLabel")}</span>
                <b>{user.username}</b>
              </div>
            </li>
            <li className="li">
              <div className="grow">
                <span className="hint">{t("profile.emailLabel")}</span>
                <b>{user.email ?? t("profile.noEmail")}</b>
                {user.email && (
                  <span className="hint">{t(`profile.emailStatus.${user.emailStatus}`)}</span>
                )}
              </div>
              {user.email && (
                <span className={user.emailStatus === "verified" ? "tag ok" : "tag warn"}>
                  {t(`profile.emailTag.${user.emailStatus}`)}
                </span>
              )}
              {user.email && user.emailStatus === "unverified" && (
                <button
                  type="button"
                  className="btn soft sm"
                  onClick={() => void sendVerification()}
                >
                  {t("profile.verifySend")}
                </button>
              )}
            </li>
          </ul>
          {verifyMessage && (
            <p
              role={verifyMessage.ok ? "status" : "alert"}
              className={verifyMessage.ok ? "hint" : "error"}
            >
              {verifyMessage.text}
            </p>
          )}

          <button
            type="button"
            className="btn ghost sm"
            aria-expanded={panel === "password"}
            onClick={() => {
              setPanel(panel === "password" ? undefined : "password");
            }}
          >
            {t("profile.passwordTitle")}
          </button>
          {panel === "password" && (
            <form className="stack card flat" onSubmit={(event) => void changePassword(event)}>
              <div className="field">
                <label htmlFor="profile-current">
                  <span>{t("profile.currentPassword")}</span>
                </label>
                <input
                  id="profile-current"
                  className="input"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="profile-new">
                  <span>{t("profile.newPassword", { min: PASSWORD_MIN_LENGTH })}</span>
                </label>
                <input
                  id="profile-new"
                  className="input"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                />
              </div>
              {passwordMessage && (
                <p
                  role={passwordMessage.ok ? "status" : "alert"}
                  className={passwordMessage.ok ? "hint" : "error"}
                >
                  {passwordMessage.text}
                </p>
              )}
              <button type="submit" className="btn sm">
                {t("profile.changePassword")}
              </button>
            </form>
          )}

          <div className="row">
            <button type="button" className="btn ghost sm" onClick={() => void session.logout()}>
              {t("nav.logout")}
            </button>
            <button
              type="button"
              className="btn danger sm"
              aria-expanded={panel === "delete"}
              onClick={() => {
                setPanel(panel === "delete" ? undefined : "delete");
              }}
            >
              {t("profile.deleteTitle")}
            </button>
          </div>
          {panel === "delete" && (
            <form className="stack card flat" onSubmit={(event) => void deleteAccount(event)}>
              <p className="sm">{t("profile.deleteHint")}</p>
              <div className="field">
                <label htmlFor="profile-delete">
                  <span>{t("profile.deletePassword")}</span>
                </label>
                <input
                  id="profile-delete"
                  className="input"
                  name="deletePassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {deleteMessage && (
                <p role="alert" className="error">
                  {deleteMessage}
                </p>
              )}
              <button type="submit" className="btn danger sm">
                {t("profile.deleteConfirm")}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
