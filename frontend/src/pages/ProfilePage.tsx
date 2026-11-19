// The user's profile: display name, email and password (ACC-04, ACC-06).
import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router";
import { PASSWORD_MIN_LENGTH, userSchema } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import { useInstall } from "../app/install.ts";
import { useWorldActive } from "../app/gameEntry.ts";
import { useSession } from "../app/session.ts";
import OwnFigure from "../profile/OwnFigure.tsx";
import ProfileEditor from "../profile/ProfileEditor.tsx";
import ProfileTabs from "../profile/ProfileTabs.tsx";
import { useProfilePeople } from "../profile/people.ts";

export default function ProfilePage() {
  const { t } = useTranslation();
  const session = useSession();
  /** The profiles of a guest (with the `vip` role) and their companions: the tabs above the cards, the editor in one. */
  const people = useProfilePeople(session.user?.roles.includes("vip") ?? false);
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string }>();
  const [nameMessage, setNameMessage] = useState<string>();
  /** The name and address as last sent: the API takes both, so a request builds on the one before it. */
  const latest = useRef<{ displayName: string; email: string | null } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string }>();
  const [verifyMessage, setVerifyMessage] = useState<{ ok: boolean; text: string }>();
  const [deleteMessage, setDeleteMessage] = useState<string>();
  const { available: canInstall } = useInstall();
  const world = useWorldActive(session.user !== null) === true;
  /** The second step of changing the password and of deleting the account. */
  const [panel, setPanel] = useState<"password" | "delete">();

  if (!session.ready) return null;
  if (!session.user) return <Navigate to="/login" replace />;
  const user = session.user;

  /** Stores the display name and the email address, which the API takes together (ACC-04). */
  async function saveProfile(change: {
    displayName?: string;
    email?: string | null;
  }): Promise<boolean> {
    latest.current ??= { displayName: user.displayName, email: user.email };
    const { displayName, email } = { ...latest.current, ...change };
    latest.current = { displayName, email };
    const result = await apiRequest("PATCH", "/api/profile", {
      csrfToken: session.csrfToken,
      body: { displayName, email },
    });
    const parsed = userSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      session.setUser(parsed.data);
      setProfileMessage({ ok: true, text: t("profile.saved") });
      setNameMessage(undefined);
      return true;
    }
    const code = result.errorCode ?? "unknown";
    const text = t(`errors.${code}`, { defaultValue: t("errors.unknown") });
    setProfileMessage({ ok: false, text });
    setNameMessage(text);
    return false;
  }

  function saveEmail(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = fieldText(new FormData(event.currentTarget), "email").trim();
    void saveProfile({ email: email === "" ? null : email });
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

  /** The input for the guest's own display name; it is stored when it is left (ACC-04). */
  const ownName = (
    <input
      id="profile-name"
      className="input"
      defaultValue={user.displayName}
      required
      maxLength={100}
      onBlur={(event) => {
        const name = event.currentTarget.value.trim();
        if (name !== "" && name !== (latest.current?.displayName ?? user.displayName))
          void saveProfile({ displayName: name });
      }}
    />
  );

  return (
    <div className="stack">
      <h1 className="h1">{t("profile.title")}</h1>
      {user.roles.includes("vip") && <ProfileTabs people={people} />}
      <div className="grid-2">
        <div className="stack">
          {!user.roles.includes("vip") && (
            <section className="card" aria-labelledby="profile-card">
              <b id="profile-card">{t("profile.cardProfile")}</b>
              <label className="field">
                <span>{t("profile.displayName")}</span>
                {ownName}
                {nameMessage && (
                  <span role="alert" className="error">
                    {nameMessage}
                  </span>
                )}
              </label>
            </section>
          )}
          {user.roles.includes("vip") && (
            <section className="card" aria-labelledby="hello-card">
              <b id="hello-card">{t("profileCard.title")}</b>
              <ProfileEditor
                people={people}
                nameField={(person) => (
                  <label className="field">
                    <span>{t("profile.displayName")}</span>
                    {person.id === "me" ? (
                      ownName
                    ) : (
                      <input id="profile-name" className="input" value={person.name} readOnly />
                    )}
                    {nameMessage && (
                      <span role="alert" className="error">
                        {nameMessage}
                      </span>
                    )}
                  </label>
                )}
              />
            </section>
          )}
        </div>
        <div className="stack">
          {world && (
            <section className="card" aria-labelledby="avatar-card">
              <b id="avatar-card">{t("avatar.cardTitle")}</b>
              <div className="figure-row">
                <OwnFigure />
                <Link className="btn soft sm" to="/avatar">
                  {t("avatar.cardButton")}
                </Link>
              </div>
              <span className="hint">{t("avatar.cardText")}</span>
            </section>
          )}

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
            <form className="stack" onSubmit={saveEmail}>
              <label className="field">
                <span>{t("profile.email")}</span>
                <input
                  id="profile-email"
                  className="input"
                  name="email"
                  type="email"
                  defaultValue={user.email ?? ""}
                  maxLength={254}
                />
              </label>
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
            {/* The note of the mock under the two buttons; the delete step has its own, longer text. */}
            {panel !== "delete" && (
              <span className="hint">
                {t(user.roles.includes("vip") ? "profile.deleteNote" : "profile.deleteNoteOther")}
              </span>
            )}
            {panel === "delete" && (
              <form className="stack card flat" onSubmit={(event) => void deleteAccount(event)}>
                <p className="sm">
                  {t(user.roles.includes("vip") ? "profile.deleteHintGuest" : "profile.deleteHint")}
                </p>
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
    </div>
  );
}
