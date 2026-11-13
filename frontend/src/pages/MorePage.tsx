// "Mehr" (sw-architecture.md 5.6, WEB-02; UX mock `more`): the visible pages in the order the admin
// set, the profile, and Verwaltung and Inhalte for those who may use them. Datenschutz and Abmelden
// are in the footer and the profile. Entries of later stages appear with their stages.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { contentResponseSchema } from "@zappaloo/shared";
import { useApiData } from "../app/useApi.ts";
import { useSession } from "../app/session.ts";

export default function MorePage() {
  const { t } = useTranslation();
  const session = useSession();
  const content = useApiData("/api/content", contentResponseSchema);
  const roles = session.user?.roles ?? [];
  const admin = roles.includes("admin");
  const contentEditor =
    admin ||
    (roles.includes("staff") && (session.user?.capabilities ?? []).includes("editWebsiteContent"));
  return (
    <section className="more">
      <h1>{t("nav.more")}</h1>
      <div className="card">
        <ul className="list">
          {content?.pages
            .filter((page) => page.inMore)
            .map((page) => (
              <li key={page.id} className="li li-row">
                <Link className="li-main" to={`/p/${page.slug}`}>
                  <b>{page.title}</b>
                </Link>
                <span className="chevron">›</span>
              </li>
            ))}
          <li className="li li-row">
            <Link className="li-main" to="/profile">
              <b>{t("website.myProfile")}</b>
            </Link>
            <span className="chevron">›</span>
          </li>
        </ul>
      </div>
      {(admin || contentEditor) && (
        <div className="card">
          <ul className="list">
            {admin && (
              <li className="li li-row">
                <Link className="li-main" to="/admin">
                  <span className="grow">
                    <b>{t("nav.admin")}</b>
                    <span className="hint">{t("website.adminOnly")}</span>
                  </span>
                </Link>
                <span className="chevron">›</span>
              </li>
            )}
            {contentEditor && (
              <li className="li li-row">
                <Link className="li-main" to="/admin/content">
                  <b>{t("admin.nav.content")}</b>
                </Link>
                <span className="chevron">›</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
