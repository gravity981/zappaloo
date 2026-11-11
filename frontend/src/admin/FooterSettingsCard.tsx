// Einstellungen › Fusszeile (LIC-02; sw-architecture.md 19.6; UX mock `admin-settings`): the
// copyright line under "Datenschutz · Version". The license sentence and the two links are fixed.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { COPYRIGHT_MAX_LENGTH, footerConfigSchema } from "@zappaloo/shared";
import { LegalNoticeView } from "../app/LegalNotice.tsx";
import { refreshSite, useSite } from "../guest/site.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const FOOTER_PATH = "/api/admin/footer";

export default function FooterSettingsCard() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const site = useSite();
  const { data, reload } = useAdminData(FOOTER_PATH, footerConfigSchema);
  /** The line being edited; undefined while it is as stored. */
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function save(copyright: string | null) {
    const result = await call("PUT", FOOTER_PATH, { copyright });
    if (result.ok) {
      setError(undefined);
      setSaved(true);
      setDraft(undefined);
      reload();
      void refreshSite();
    } else {
      setError(errorText(result.errorCode));
      setSaved(false);
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft !== undefined) void save(draft.trim());
  }

  if (!data) return null;
  const text = draft ?? data.copyright;
  return (
    <section className="card" aria-labelledby="footer-title">
      <b id="footer-title">{t("admin.footer.title")}</b>
      <span className="hint">{t("admin.footer.hint")}</span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>{t("admin.footer.label")}</span>
          <input
            className="input"
            value={text}
            maxLength={COPYRIGHT_MAX_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
          />
          <small className="hint">
            {t("admin.footer.fieldHint", { max: COPYRIGHT_MAX_LENGTH })}
          </small>
        </label>
        <span className="eyebrow">{t("admin.footer.preview")}</span>
        <LegalNoticeView
          copyright={text.trim() === "" ? null : text.trim()}
          sourceUrl={site?.sourceUrl ?? ""}
        />
        <div className="row">
          <button type="submit" className="btn soft sm" disabled={draft === undefined}>
            {t("admin.footer.save")}
          </button>
          {data.custom && (
            <button type="button" className="btn ghost sm" onClick={() => void save(null)}>
              {t("admin.footer.reset")}
            </button>
          )}
          {saved && (
            <span role="status" className="hint">
              {t("admin.footer.saved")}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
