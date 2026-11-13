import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { versionResponseSchema } from "@zappaloo/shared";
import LegalNotice from "./LegalNotice.tsx";
import { displayVersion } from "./version.ts";

export default function VersionFooter() {
  const { t } = useTranslation();
  const [serverVersion, setServerVersion] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/version", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        setServerVersion(versionResponseSchema.parse(body).version);
      })
      .catch(() => {
        // Not critical: the compiled-in version is shown instead.
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <footer className="version-footer">
      <Link to="/datenschutz">{t("footer.privacy")}</Link> ·{" "}
      <span>
        {t("footer.version", { version: displayVersion(__APP_VERSION__, serverVersion) })}
      </span>
      <LegalNotice />
    </footer>
  );
}
