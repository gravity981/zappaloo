// The avatar editor as a page of its own (AVA-01, AVA-02): reached from the profile. The first entry into the game
// uses the same editor as its first step (step 5i).
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { useWorldActive } from "../app/gameEntry.ts";
import AvatarEditor from "../avatar/AvatarEditor.tsx";

/** Where the editor leads when everyone has a figure. */
const AFTER_PATH = "/profile";

export default function AvatarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const world = useWorldActive(true);
  // The editor belongs to the world; a guest without access is sent to the start page (MAP-19).
  if (world === false) return <Navigate to="/" replace />;
  if (world === undefined) return null;
  return (
    <section className="avatar-page">
      <h1 className="h1">{t("avatar.title")}</h1>
      <AvatarEditor
        continueLabel={t("avatar.finish")}
        onContinue={() => {
          void navigate(AFTER_PATH);
        }}
      />
    </section>
  );
}
