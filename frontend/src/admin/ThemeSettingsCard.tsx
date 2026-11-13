// Einstellungen › Design (THM-01, THM-03, THM-05; sw-architecture.md 19.7; UX mock `admin-settings`):
// the active theme, the import of a theme package as a whole, the findings of a refused package,
// and the return to the platform's default theme, which takes a second click.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { themeRefusalSchema, themeStatusSchema } from "@zappaloo/shared";
import type { ThemeFinding } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useEventFormat } from "../rsvp/format.ts";
import { useAdminData, useErrorText } from "./data.ts";

/** The German reason of each finding code the validator gives (19.7, THM-03). */
const FINDING_KEYS = {
  archive_too_large: "admin.theme.findings.archive_too_large",
  unpacked_too_large: "admin.theme.findings.unpacked_too_large",
  not_gzip: "admin.theme.findings.not_gzip",
  not_tar: "admin.theme.findings.not_tar",
  entry_type: "admin.theme.findings.entry_type",
  entry_path: "admin.theme.findings.entry_path",
  entry_duplicate: "admin.theme.findings.entry_duplicate",
  file_not_in_layout: "admin.theme.findings.file_not_in_layout",
  file_missing: "admin.theme.findings.file_missing",
  json_invalid: "admin.theme.findings.json_invalid",
  json_field: "admin.theme.findings.json_field",
  format_version: "admin.theme.findings.format_version",
  icon_not_png: "admin.theme.findings.icon_not_png",
  icon_size: "admin.theme.findings.icon_size",
  font_not_woff2: "admin.theme.findings.font_not_woff2",
  font_too_large: "admin.theme.findings.font_too_large",
  font_count: "admin.theme.findings.font_count",
  font_unreferenced: "admin.theme.findings.font_unreferenced",
  font_missing: "admin.theme.findings.font_missing",
  contrast: "admin.theme.findings.contrast",
} as const;
type FindingCode = keyof typeof FINDING_KEYS;

const THEME_PATH = "/api/admin/theme";

export default function ThemeSettingsCard() {
  const { t } = useTranslation();
  const format = useEventFormat();
  const errorText = useErrorText();
  const { csrfToken } = useSession();
  const { data, failed, reload } = useAdminData(THEME_PATH, themeStatusSchema);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [findings, setFindings] = useState<ThemeFinding[]>();
  /** The return to the default waits for the second click. */
  const [armed, setArmed] = useState(false);

  /** The reason of a finding in words; the server's detail follows it. */
  function reason(finding: ThemeFinding): string {
    return finding.code in FINDING_KEYS
      ? t(FINDING_KEYS[finding.code as FindingCode])
      : finding.detail;
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    setFindings(undefined);
    // The server reads a package only as gzip; the browser may name the type differently.
    const archive = new Blob([file], { type: "application/gzip" });
    const result = await apiRequest("POST", THEME_PATH, { csrfToken, raw: archive });
    setBusy(false);
    if (result.ok) {
      setSaved(t("admin.theme.imported"));
      reload();
      return;
    }
    const refusal = themeRefusalSchema.safeParse(result.body);
    if (result.status === 422 && refusal.success) {
      setFindings(refusal.data.findings);
      return;
    }
    setError(errorText(result.errorCode));
  }

  async function resetToDefault() {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    setFindings(undefined);
    const result = await apiRequest("DELETE", THEME_PATH, { csrfToken });
    setBusy(false);
    setArmed(false);
    if (result.ok) {
      setSaved(t("admin.theme.reset"));
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  if (failed) {
    return (
      <section className="card" aria-labelledby="theme-title">
        <b id="theme-title">{t("admin.theme.title")}</b>
        <p className="error">{errorText(failed)}</p>
      </section>
    );
  }
  if (!data) return null;
  const active = data.active;

  return (
    <section className="card" aria-labelledby="theme-title">
      <div className="row">
        <b id="theme-title" className="grow">
          {t("admin.theme.title")}
        </b>
        {active ? (
          <span className="tag ok">{t("admin.theme.activeTag", { name: active.name })}</span>
        ) : (
          <span className="tag line">{t("admin.theme.standardTag")}</span>
        )}
      </div>
      <span className="hint">
        {active
          ? t("admin.theme.info", {
              version: active.formatVersion,
              date: format.date(active.importedAt),
              time: format.time(active.importedAt),
            })
          : t("admin.theme.standardInfo")}
      </span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row">
        <label className="btn soft sm">
          {busy ? t("admin.theme.importing") : t("admin.theme.importButton")}
          <input
            type="file"
            accept=".tar.gz,application/gzip"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </label>
        {active &&
          (armed ? (
            <>
              <button
                type="button"
                className="btn soft sm"
                disabled={busy}
                onClick={() => void resetToDefault()}
              >
                {t("admin.theme.resetConfirm")}
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setArmed(false);
                }}
              >
                {t("admin.theme.cancel")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => {
                setSaved(undefined);
                setArmed(true);
              }}
            >
              {t("admin.theme.resetButton")}
            </button>
          ))}
        {saved && (
          <span role="status" className="hint">
            {saved}
          </span>
        )}
      </div>
      <span className="hint">{t("admin.theme.hint")}</span>
      {findings && (
        <div className="card flat">
          <b className="sm">{t("admin.theme.refusedTitle")}</b>
          <span className="hint">{t("admin.theme.refusedHint")}</span>
          <ul className="list sm">
            {findings.map((finding, index) => (
              <li key={`${finding.file}-${finding.code}-${String(index)}`}>
                {finding.file}: {reason(finding)}
                {finding.detail && <span className="hint"> ({finding.detail})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
