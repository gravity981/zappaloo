// A guest's RSVP in admin mode (RSVP-04): the same wizard, without the deadline.
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import RsvpWizard from "../rsvp/RsvpWizard.tsx";

const LIST = "/admin/rsvp";

export default function AdminRsvpGuestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = Number(useParams().id);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const mode = { kind: "admin", userId } as const;
  return (
    <div className="stack">
      <Link to={LIST}>{t("admin.rsvp.backToList")}</Link>
      <RsvpWizard
        mode={mode}
        onFinish={() => {
          void navigate(LIST);
        }}
      />
    </div>
  );
}
