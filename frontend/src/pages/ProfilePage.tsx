// The user's profile: display name, email and password (ACC-04, ACC-06).
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { PASSWORD_MIN_LENGTH, userSchema } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import { useSession } from "../app/session.ts";

export default function ProfilePage() {
  const { t } = useTranslation();
  const session = useSession();
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string }>();
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string }>();

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

  return (
    <section>
      <h1>{t("profile.title")}</h1>
      <p>{t("profile.username", { username: user.username })}</p>
      <form onSubmit={(event) => void saveProfile(event)}>
        <label>
          {t("profile.displayName")}
          <input name="displayName" defaultValue={user.displayName} required maxLength={100} />
        </label>
        <label>
          {t("profile.email")}
          <input name="email" type="email" defaultValue={user.email ?? ""} />
        </label>
        {user.email && <p>{t(`profile.emailStatus.${user.emailStatus}`)}</p>}
        {profileMessage && (
          <p role={profileMessage.ok ? "status" : "alert"}>{profileMessage.text}</p>
        )}
        <button type="submit">{t("profile.save")}</button>
      </form>

      <h2>{t("profile.passwordTitle")}</h2>
      <form onSubmit={(event) => void changePassword(event)}>
        <label>
          {t("profile.currentPassword")}
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label>
          {t("profile.newPassword", { min: PASSWORD_MIN_LENGTH })}
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
          />
        </label>
        {passwordMessage && (
          <p role={passwordMessage.ok ? "status" : "alert"}>{passwordMessage.text}</p>
        )}
        <button type="submit">{t("profile.changePassword")}</button>
      </form>
    </section>
  );
}
