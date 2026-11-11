// Einstellungen › Datenschutz (SEC-09; sw-architecture.md 24): the privacy notice as Markdown.
// Public under /datenschutz; without an edit the platform's German default text is used.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PRIVACY_MAX_LENGTH, privacyConfigSchema } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const PRIVACY_PATH = "/api/admin/privacy";

export default function PrivacySettingsCard() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData(PRIVACY_PATH, privacyConfigSchema);
  /** The text being edited; undefined while it is as stored. */
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function save(markdown: string | null) {
    const result = await call("PUT", PRIVACY_PATH, { markdown });
    if (result.ok) {
      setError(undefined);
      setSaved(true);
      setDraft(undefined);
      reload();
    } else {
      setError(errorText(result.errorCode));
      setSaved(false);
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft !== undefined && draft.trim() !== "") void save(draft.trim());
  }

  if (!data) return null;
  const text = draft ?? data.markdown;
  return (
    <section className="card" aria-labelledby="privacy-title">
      <div className="row">
        <b id="privacy-title" className="grow">
          {t("admin.privacy.title")}
        </b>
        <Link className="sm" to="/datenschutz">
          {t("admin.privacy.view")}
        </Link>
      </div>
      <span className="hint">{t("admin.privacy.hint")}</span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="visually-hidden">{t("admin.privacy.label")}</span>
          <textarea
            className="input privacy-text"
            value={text}
            maxLength={PRIVACY_MAX_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <div className="row">
          <button type="submit" className="btn soft sm" disabled={draft === undefined}>
            {t("admin.privacy.save")}
          </button>
          {data.custom && (
            <button type="button" className="btn ghost sm" onClick={() => void save(null)}>
              {t("admin.privacy.reset")}
            </button>
          )}
          {saved && (
            <span role="status" className="hint">
              {t("admin.privacy.saved")}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
