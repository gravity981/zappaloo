// The privacy notice (SEC-09, SEC-11; sw-architecture.md 24): public, readable without sign-in,
// linked from every page. The text is the admin's Markdown, or the default.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { privacyResponseSchema } from "@zappaloo/shared";
import { useAdminData, useErrorText } from "../admin/data.ts";
import Markdown from "../app/Markdown.tsx";

export default function PrivacyPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { data, failed } = useAdminData("/api/privacy", privacyResponseSchema);
  return (
    <section>
      {failed && (
        <p role="alert" className="error">
          {errorText(failed)}
        </p>
      )}
      {data && <Markdown text={data.markdown} />}
      <p>
        <Link to="/">{t("privacy.back")}</Link>
      </p>
    </section>
  );
}
