// The avatar editor as a page of its own (AVA-01, AVA-02): reached from the profile. The first entry into the game
// uses the same editor as its first step (step 5i).
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import AvatarEditor from "../avatar/AvatarEditor.tsx";

/** Where the editor leads when everyone has a figure. */
const AFTER_PATH = "/profile";

export default function AvatarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
