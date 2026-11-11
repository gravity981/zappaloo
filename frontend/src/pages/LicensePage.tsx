// The license (LIC-03; sw-architecture.md 19.6; UX mock `license`): public, opened by "Lizenz" in
// the footer. The text is the AGPL-3.0 of the running version.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { licenseResponseSchema } from "@zappaloo/shared";
import { useAdminData, useErrorText } from "../admin/data.ts";
import { BareShell } from "../guest/Shells.tsx";
import { useSite } from "../guest/site.ts";

export default function LicensePage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const site = useSite();
  const { data, failed } = useAdminData("/api/license", licenseResponseSchema);
  return (
    <BareShell wide>
      <h1 className="h1">{t("license.title")}</h1>
      <p>{t("license.intro")}</p>
      {site && (
        <p>
          <a href={site.sourceUrl} target="_blank" rel="noreferrer noopener">
            {t("license.viewSource")}
          </a>
        </p>
      )}
      {failed && (
        <p role="alert" className="error">
          {errorText(failed)}
        </p>
      )}
      {data && <pre className="license-text">{data.text}</pre>}
      <Link className="sm" to="/">
        {t("privacy.back")}
      </Link>
    </BareShell>
  );
}
