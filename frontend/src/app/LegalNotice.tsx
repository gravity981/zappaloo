// The copyright and license notice under "Datenschutz · Version" (LIC-01, LIC-03; sw-architecture.md
// 19.6; UX mock `legal`): the admin's copyright line, the fixed license sentence and the links
// to the source code and to the license page.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useSite } from "../guest/site.ts";

export function LegalNoticeView({
  copyright,
  sourceUrl,
}: {
  /** The admin's line; null or empty hides it. */
  copyright: string | null;
  sourceUrl: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="legal">
      {copyright && <b>{copyright}</b>}
      <span>{t("legal.license")}</span>
      <span className="legal-links">
        <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
          {t("legal.source")}
        </a>
        <Link to="/license">{t("legal.licensePage")}</Link>
      </span>
    </div>
  );
}

export default function LegalNotice() {
  const site = useSite();
  if (!site) return null;
  return <LegalNoticeView copyright={site.copyright} sourceUrl={site.sourceUrl} />;
}
