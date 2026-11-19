// Konten › account panel › Profil (PRES-14; UX mock `admin-users`): the photo, greeting and free line of a guest and
// their approved companions, each with a button to remove it, as a safety net: profiles are not moderated. A removal
// needs a second click and is audited with ids only.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { adminProfilesResponseSchema } from "@zappaloo/shared";
import type { ProfileRemovable } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const PARTS: readonly ProfileRemovable[] = ["photo", "greeting", "relationLine"];

export default function ProfilesSection({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData(
    `/api/admin/profiles/${String(userId)}`,
    adminProfilesResponseSchema,
  );
  /** The removal waiting for its second click: `<person key>/<part>`. */
  const [confirming, setConfirming] = useState<string>();
  const [error, setError] = useState<string>();

  async function remove(key: string, part: ProfileRemovable) {
    const result = await call("DELETE", `/api/admin/profiles/${key}/${part}`);
    setConfirming(undefined);
    setError(result.ok ? undefined : errorText(result.errorCode));
    if (result.ok) reload();
  }

  if (!data) return null;
  const empty = data.persons.every(
    (person) => person.photo === null && person.greeting === null && person.relationLine === null,
  );
  return (
    <section className="stack" aria-labelledby="account-profile">
      <b id="account-profile">{t("admin.profiles.title")}</b>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {empty && <span className="hint">{t("admin.profiles.empty")}</span>}
      {data.persons.map((person) => {
        const shown: Record<ProfileRemovable, boolean> = {
          photo: person.photo !== null,
          greeting: person.greeting !== null,
          relationLine: person.relationLine !== null,
        };
        const parts = PARTS.filter((part) => shown[part]);
        if (parts.length === 0) return null;
        return (
          <div key={person.key} className="stack card flat" data-testid={`profile-${person.key}`}>
            <b>{person.name}</b>
            {person.photo !== null && (
              <img
                className="bubble-pic large"
                src={`/api/admin/profiles/${person.key}/photo?v=${String(person.photo)}`}
                alt=""
              />
            )}
            {person.greeting !== null && <span>{person.greeting}</span>}
            {person.relationLine !== null && <span className="hint">{person.relationLine}</span>}
            <div className="row">
              {parts.map((part) => {
                const id = `${person.key}/${part}`;
                const label = t(`admin.profiles.parts.${part}`);
                return confirming === id ? (
                  <span key={id} className="row">
                    <span>{t("admin.profiles.confirm", { part: label })}</span>
                    <button
                      type="button"
                      className="btn danger sm"
                      onClick={() => void remove(person.key, part)}
                    >
                      {t("admin.profiles.yes")}
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setConfirming(undefined);
                      }}
                    >
                      {t("admin.profiles.no")}
                    </button>
                  </span>
                ) : (
                  <button
                    key={id}
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      setConfirming(id);
                    }}
                  >
                    {t("admin.profiles.remove", { part: label })}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
