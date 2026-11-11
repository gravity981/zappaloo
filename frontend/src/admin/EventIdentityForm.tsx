// Name, time zone and default language of the event (CFG-02, CFG-06): the one-time setup form
// and the "Veranstaltung" card in Einstellungen use it. After the admin mock "Event setup".
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { fieldText } from "../app/forms.ts";
import { useErrorText } from "./data.ts";
import type { EventIdentity } from "./identity.ts";

/** The languages the platform ships (LANG-01). */
const LANGUAGES = ["de"] as const;

/** The IANA names the browser knows; a few common ones if it cannot list them. */
function timeZoneNames(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return supported?.("timeZone") ?? ["Europe/Zurich", "Europe/Berlin", "Europe/Vienna", "UTC"];
}

/**
 * `onSubmit` returns an error code, or undefined when it worked. Fields start with `initial`.
 */
export default function EventIdentityForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: EventIdentity;
  submitLabel: string;
  onSubmit: (values: EventIdentity) => Promise<string | undefined>;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setSaved(false);
    const failed = await onSubmit({
      name: fieldText(form, "name").trim(),
      timezone: fieldText(form, "timezone").trim(),
      defaultLanguage: fieldText(form, "defaultLanguage"),
    });
    setBusy(false);
    setError(failed && errorText(failed));
    setSaved(failed === undefined);
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => void submit(event)}
      onChange={() => {
        setSaved(false);
      }}
    >
      <label className="field">
        <span>{t("admin.identity.name")}</span>
        <input
          className="input"
          name="name"
          defaultValue={initial.name}
          placeholder={t("admin.identity.namePlaceholder")}
          maxLength={200}
          required
        />
      </label>
      <div className="field">
        <label htmlFor="identity-timezone">{t("admin.identity.timezone")}</label>
        <input
          id="identity-timezone"
          className="input"
          name="timezone"
          defaultValue={initial.timezone}
          list="time-zones"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="identity-timezone-hint"
          required
        />
        <datalist id="time-zones">
          {timeZoneNames().map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <small id="identity-timezone-hint" className="hint">
          {t("admin.identity.timezoneHint")}
        </small>
      </div>
      <label className="field">
        <span>{t("admin.identity.language")}</span>
        <select
          className="input auto"
          name="defaultLanguage"
          defaultValue={initial.defaultLanguage}
        >
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`admin.identity.languages.${code}`)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && <p role="status">{t("admin.identity.saved")}</p>}
      <button type="submit" className="btn" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {submitLabel}
      </button>
    </form>
  );
}
