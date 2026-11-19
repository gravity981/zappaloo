// The profile of the guest and each approved companion (sw-architecture.md 3.6; PRES-09, PRES-13, PRES-15; UX mocks
// `profile` and `onboard-profile`): an optional photo, greeting and "How I know the couple" (a list option and a free
// line), with a live preview of the speech bubble other guests see. Every change is stored at once (the text on
// leaving a field), so the page that holds the editor needs no "Save".
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PROFILE_LIMITS, profilePeopleResponseSchema } from "@zappaloo/shared";
import ProfileTabs from "./ProfileTabs.tsx";
import { useProfilePeople } from "./people.ts";
import type { ProfilePeople } from "./people.ts";
import type { ProfilePerson } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The first letters of a name, for the round picture without a photo. */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((part) => part !== "")
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toLocaleUpperCase() || "?"
  );
}

const photoAddress = (person: ProfilePerson): string | undefined =>
  person.photo === null
    ? undefined
    : `/api/profile/people/${person.id}/photo?v=${String(person.photo)}`;

/** What others see in the speech bubble: picture, name, badge, greeting and line. */
export function BubbleCard({
  name,
  photo,
  badge,
  greeting,
  line,
}: {
  name: string;
  photo: string | undefined;
  badge: string | undefined;
  greeting: string;
  line: string;
}) {
  return (
    <div className="bubble-card" data-testid="bubble-preview">
      {photo === undefined ? (
        <span className="bubble-pic large" aria-hidden="true">
          {initials(name)}
        </span>
      ) : (
        <img className="bubble-pic large" src={photo} alt="" />
      )}
      <div className="stack bubble-text">
        <b>{name}</b>
        {badge !== undefined && <span className="tag">{badge}</span>}
        {greeting !== "" && <span>{greeting}</span>}
        {line !== "" && <span className="hint">{line}</span>}
      </div>
    </div>
  );
}

export default function ProfileEditor({
  people,
  nameField,
}: {
  /** The profiles when the page loads them itself (it shows the person tabs above the cards); else the editor does. */
  people?: ProfilePeople;
  /** The display name between the photo and the greeting (the profile page); undefined where it is not edited. */
  nameField?: (person: ProfilePerson) => ReactNode;
}) {
  const { t } = useTranslation();
  const { csrfToken } = useSession();
  const own = useProfilePeople(people === undefined);
  const { data, setData, failed, who, setWho } = people ?? own;
  const [message, setMessage] = useState<string>();
  /** The texts being typed, by person, until they are stored. */
  const [drafts, setDrafts] = useState<Record<string, { greeting: string; line: string }>>({});
  const file = useRef<HTMLInputElement>(null);

  if (failed) return <p role="alert">{t("profileCard.loadFailed")}</p>;
  if (data === undefined) return <p>{t("profileCard.loading")}</p>;
  const person = data.persons.find((item) => item.id === who) ?? data.persons[0];
  if (person === undefined) return null;
  const draft = drafts[person.id] ?? {
    greeting: person.greeting ?? "",
    line: person.relationLine ?? "",
  };
  const relation = data.relations.find((option) => option.id === person.relation);

  function take(result: Awaited<ReturnType<typeof apiRequest>>): void {
    const parsed = profilePeopleResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setData(parsed.data);
      setMessage(undefined);
    } else {
      const code = result.errorCode ?? "unknown";
      setMessage(
        t(`profileCard.errors.${code}`, { defaultValue: t("profileCard.errors.unknown") }),
      );
    }
  }

  async function saveText(next: { greeting: string; line: string; relation: number | null }) {
    if (person === undefined) return;
    take(
      await apiRequest("PUT", `/api/profile/people/${person.id}`, {
        csrfToken,
        body: { greeting: next.greeting, relation: next.relation, relationLine: next.line },
      }),
    );
  }

  async function pickPhoto(selected: File | undefined) {
    if (person === undefined || selected === undefined) return;
    if (!PHOTO_TYPES.includes(selected.type)) {
      setMessage(t("profileCard.errors.photo_type"));
      return;
    }
    take(
      await apiRequest("PUT", `/api/profile/people/${person.id}/photo`, {
        csrfToken,
        raw: selected,
      }),
    );
    if (file.current) file.current.value = "";
  }

  return (
    <div className="stack profile-editor">
      {people === undefined && (
        <ProfileTabs
          people={{
            data,
            setData,
            failed,
            who,
            setWho: (id) => {
              setWho(id);
              setMessage(undefined);
            },
          }}
        />
      )}
      <div className="profile-photo">
        {photoAddress(person) === undefined ? (
          <span className="bubble-pic large" aria-hidden="true">
            {initials(person.name)}
          </span>
        ) : (
          <img className="bubble-pic large" src={photoAddress(person)} alt="" />
        )}
        <input
          ref={file}
          type="file"
          hidden
          aria-label={t("profileCard.photoInput")}
          accept={PHOTO_TYPES.join(",")}
          onChange={(event) => {
            void pickPhoto(event.currentTarget.files?.[0]);
          }}
        />
        <div className="profile-photo-actions">
          <button
            type="button"
            className="btn soft sm"
            onClick={() => {
              file.current?.click();
            }}
          >
            {person.photo === null ? t("profileCard.photoAdd") : t("profileCard.photoChange")}
          </button>
          {person.photo !== null && (
            <button
              type="button"
              className="btn soft sm"
              onClick={() => {
                void apiRequest("DELETE", `/api/profile/people/${person.id}/photo`, {
                  csrfToken,
                }).then(take);
              }}
            >
              {t("profileCard.photoRemove")}
            </button>
          )}
        </div>
      </div>
      {nameField?.(person)}
      <label className="field">
        <span>{t("profileCard.greeting")}</span>
        <input
          className="input"
          value={draft.greeting}
          maxLength={PROFILE_LIMITS.greeting}
          placeholder={t("profileCard.greetingPlaceholder")}
          onChange={(event) => {
            setDrafts({ ...drafts, [person.id]: { ...draft, greeting: event.target.value } });
          }}
          onBlur={() => {
            if (draft.greeting.trim() !== (person.greeting ?? "")) {
              void saveText({ ...draft, relation: person.relation });
            }
          }}
        />
      </label>
      <div className="field" role="group" aria-labelledby="profile-how">
        <span id="profile-how">{t("profileCard.how")}</span>
        <div className="chips">
          {data.relations.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chip small"
              aria-pressed={option.id === person.relation}
              onClick={() => {
                void saveText({
                  ...draft,
                  relation: option.id === person.relation ? null : option.id,
                });
              }}
            >
              {option.name}
            </button>
          ))}
        </div>
        <input
          className="input"
          aria-labelledby="profile-how"
          value={draft.line}
          maxLength={PROFILE_LIMITS.relationLine}
          placeholder={t("profileCard.linePlaceholder")}
          onChange={(event) => {
            setDrafts({ ...drafts, [person.id]: { ...draft, line: event.target.value } });
          }}
          onBlur={() => {
            if (draft.line.trim() !== (person.relationLine ?? "")) {
              void saveText({ ...draft, relation: person.relation });
            }
          }}
        />
      </div>
      {message !== undefined && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      <span className="eyebrow">{t("profileCard.preview")}</span>
      <BubbleCard
        name={person.name}
        photo={photoAddress(person)}
        badge={relation?.name}
        greeting={draft.greeting.trim() || t("profileCard.defaultGreeting")}
        line={draft.line.trim()}
      />
    </div>
  );
}
