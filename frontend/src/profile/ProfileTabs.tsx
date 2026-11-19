// The person tabs of the profile: the guest and each approved companion (UX mock `profile`). Without a companion
// there is nothing to switch, so no tabs are shown.
import { useTranslation } from "react-i18next";
import type { ProfilePeople } from "./people.ts";

export default function ProfileTabs({ people }: { people: ProfilePeople }) {
  const { t } = useTranslation();
  const { data, who, setWho } = people;
  if (data === undefined || data.persons.length < 2) return null;
  const selected = data.persons.find((item) => item.id === who) ?? data.persons[0];
  return (
    <div className="chips" role="group" aria-label={t("profileCard.persons")}>
      {data.persons.map((item) => (
        <button
          key={item.id}
          type="button"
          className="chip"
          aria-pressed={item.id === selected?.id}
          onClick={() => {
            setWho(item.id);
          }}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
