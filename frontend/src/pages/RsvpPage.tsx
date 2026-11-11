// The guest's RSVP (RSVP-01, RSVP-03, RSVP-04, RSVP-06; sw-architecture.md 7.4). Only guests
// (`vip`) answer, and only while the feature is on.
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { FeatureGate } from "../app/FeatureGate.tsx";
import { useSession } from "../app/session.ts";
import RsvpWizard from "../rsvp/RsvpWizard.tsx";

const FEATURE = "rsvp";
const GUEST = { kind: "guest" } as const;

export default function RsvpPage() {
  const { t } = useTranslation();
  const session = useSession();
  const navigate = useNavigate();
  if (!session.ready) return null;
  if (!session.user?.roles.includes("vip")) return <Navigate to="/" replace />;
  return (
    <FeatureGate feature={FEATURE} fallback={<p>{t("errors.feature_disabled")}</p>}>
      <div className="admin embedded">
        <RsvpWizard
          mode={GUEST}
          onFinish={() => {
            void navigate("/");
          }}
        />
      </div>
    </FeatureGate>
  );
}
