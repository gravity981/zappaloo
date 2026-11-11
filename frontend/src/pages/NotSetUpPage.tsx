// Shown to everyone but admins until the admin has set the event up (CFG-02, 19.3.1).
import { useTranslation } from "react-i18next";

export default function NotSetUpPage() {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("notSetUp.title")}</h1>
      <p>{t("notSetUp.text")}</p>
    </section>
  );
}
