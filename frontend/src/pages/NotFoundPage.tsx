import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("notFound.title")}</h1>
      <Link to="/">{t("notFound.backHome")}</Link>
    </section>
  );
}
