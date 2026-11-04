import { useTranslation } from "react-i18next";

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("home.title")}</h1>
      <p>{t("home.placeholder")}</p>
    </section>
  );
}
