// A path that does not exist, for a signed-in user (UX mock `not-found`); everyone else is
// sent to the login page first.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="stack" style={{ maxWidth: 400, marginInline: "auto" }}>
      <div className="card flat notice">
        <div className="avatar" aria-hidden="true">
          ?
        </div>
        <h1 className="h1">{t("notFound.title")}</h1>
        <p className="muted">{t("notFound.text")}</p>
      </div>
      <Link className="btn block" to="/">
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}
