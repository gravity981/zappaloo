import { useTranslation } from "react-i18next";
import { useRestricted } from "../app/restricted.ts";
import WaitingPage from "../waiting/WaitingPage.tsx";

export default function HomePage() {
  const { t } = useTranslation();
  // While the platform is closed, guests land on the waiting page (ACS-10).
  if (useRestricted()) return <WaitingPage />;
  return (
    <section>
      <h1>{t("home.title")}</h1>
      <p>{t("home.placeholder")}</p>
    </section>
  );
}
