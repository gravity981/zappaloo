// Einstellungen › Plattform öffnen and Warteseite-Texte (ACS-11, ACS-13; sw-architecture.md
// 10.4): the announced opening date, the countdown switch and the three texts of the waiting
// page. Opening and closing the platform comes with step 3d.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_WAITING_TEXTS,
  instantToLocal,
  localToInstant,
  WAITING_PLACEHOLDERS,
  WAITING_TEXT_KEYS,
  openPlatformResponseSchema,
  platformStatusSchema,
  waitingConfigSchema,
} from "@zappaloo/shared";
import type { WaitingTextKey, WaitingUpdate } from "@zappaloo/shared";
import { fieldText } from "../app/forms.ts";
import { useEvent } from "../app/event.ts";
import { useAdminCall, useAdminData, useErrorText, useRefreshEvent } from "./data.ts";
import { Switch } from "./ui.tsx";

const WAITING_PATH = "/api/admin/waiting";
const PLATFORM_PATH = "/api/admin/platform";

export default function WaitingSettingsCards() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const event = useEvent();
  const timeZone = event?.timezone ?? "UTC";
  const { data, reload } = useAdminData(WAITING_PATH, waitingConfigSchema);
  const { data: platform, reload: reloadPlatform } = useAdminData(
    PLATFORM_PATH,
    platformStatusSchema,
  );
  const refreshEvent = useRefreshEvent();
  /** Whether the opening sends the email; on while someone can receive it. */
  const [emailChoice, setEmailChoice] = useState<boolean>();
  const [outcome, setOutcome] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<"opening" | "texts">();
  /** The texts being edited; what the admin has not touched is as stored. */
  const [drafts, setDrafts] = useState<Partial<Record<WaitingTextKey, string>>>({});

  async function change(changes: WaitingUpdate, what: "opening" | "texts") {
    const result = await call("PATCH", WAITING_PATH, changes);
    if (result.ok) {
      setError(undefined);
      setSaved(what);
      reload();
      return true;
    }
    setError(errorText(result.errorCode));
    setSaved(undefined);
    return false;
  }

  async function openPlatform() {
    if (!platform) return;
    const sendEmail = emailChoice ?? platform.recipientCount > 0;
    const result = await call("POST", `${PLATFORM_PATH}/open`, { sendEmail });
    const parsed = openPlatformResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      const { sent, failed } = parsed.data;
      setError(undefined);
      setOutcome(
        [
          sendEmail ? t("admin.waiting.openedMails", { count: sent }) : t("admin.waiting.opened"),
          failed > 0 ? t("admin.waiting.mailsFailed", { count: failed }) : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } else {
      setError(errorText(result.errorCode));
      setOutcome(undefined);
    }
    reloadPlatform();
    await refreshEvent();
  }

  async function closePlatform() {
    const result = await call("POST", `${PLATFORM_PATH}/close`);
    if (result.ok) {
      setError(undefined);
      setOutcome(t("admin.waiting.closed"));
    } else {
      setError(errorText(result.errorCode));
      setOutcome(undefined);
    }
    reloadPlatform();
    await refreshEvent();
  }

  const switchCountdown = (countdownEnabled: boolean) => {
    void change({ countdownEnabled }, "opening");
  };

  async function saveOpening(form: SubmitEvent<HTMLFormElement>) {
    form.preventDefault();
    const local = fieldText(new FormData(form.currentTarget), "openingAt");
    await change(
      { openingAt: local === "" ? null : localToInstant(local, timeZone).toISOString() },
      "opening",
    );
  }

  async function saveTexts(form: SubmitEvent<HTMLFormElement>) {
    form.preventDefault();
    // Only the texts that were edited go to the server.
    const texts = Object.fromEntries(
      WAITING_TEXT_KEYS.flatMap((key) => {
        const draft = drafts[key];
        return draft === undefined || draft.trim() === data?.texts[key]
          ? []
          : [[key, draft.trim()]];
      }),
    );
    if (Object.keys(texts).length === 0) return;
    if (await change({ texts }, "texts")) setDrafts({});
  }

  if (!data) return null;
  return (
    <>
      <section className="card strong" aria-labelledby="opening-title">
        <div className="row">
          <b id="opening-title" className="h2 grow">
            {t("admin.waiting.openingTitle")}
          </b>
          <span className={event?.settings.platformOpen ? "tag ok" : "tag warn"}>
            {event?.settings.platformOpen ? t("admin.platformOpen") : t("admin.platformClosed")}
          </span>
        </div>
        <p className="muted sm">{t("admin.waiting.openingHint")}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form className="stack" onSubmit={(form) => void saveOpening(form)}>
          <label className="field">
            <span>{t("admin.waiting.openingAt")}</span>
            <input
              className="input auto"
              name="openingAt"
              type="datetime-local"
              key={data.openingAt ?? "none"}
              defaultValue={data.openingAt ? instantToLocal(data.openingAt, timeZone) : ""}
            />
            <span className="hint">{t("admin.waiting.openingAtHint")}</span>
          </label>
          <div className="row">
            <button type="submit" className="btn soft sm">
              {t("admin.waiting.saveOpening")}
            </button>
            {saved === "opening" && (
              <span role="status" className="hint">
                {t("admin.waiting.saved")}
              </span>
            )}
          </div>
        </form>
        <div className="setrow">
          <div className="grow">
            <b className="sm">{t("admin.waiting.countdown")}</b>
            <span className="hint">{t("admin.waiting.countdownHint")}</span>
          </div>
          <Switch
            checked={data.countdownEnabled}
            label={t("admin.waiting.countdown")}
            onChange={switchCountdown}
          />
        </div>
        {platform && !platform.open && (
          <>
            <label className="row sm">
              <input
                type="checkbox"
                checked={emailChoice ?? platform.recipientCount > 0}
                disabled={platform.recipientCount === 0}
                onChange={(event) => {
                  setEmailChoice(event.target.checked);
                }}
              />
              {t("admin.waiting.sendEmail", { count: platform.recipientCount })}
            </label>
            <button type="button" className="btn" onClick={() => void openPlatform()}>
              {t("admin.waiting.openNow")}
            </button>
          </>
        )}
        {platform?.open && (
          <>
            <span className="hint">{t("admin.waiting.closeHint")}</span>
            <button type="button" className="btn ghost" onClick={() => void closePlatform()}>
              {t("admin.waiting.closeAgain")}
            </button>
          </>
        )}
        {outcome && (
          <p role="status" className="hint">
            {outcome}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="waiting-texts-title">
        <b id="waiting-texts-title">{t("admin.waiting.textsTitle")}</b>
        <span className="hint">
          {t("admin.waiting.placeholders", {
            list: WAITING_PLACEHOLDERS.map((name) => `{${name}}`).join(", "),
          })}
        </span>
        <form className="stack" onSubmit={(form) => void saveTexts(form)}>
          {WAITING_TEXT_KEYS.map((key) => (
            <div key={key} className="field">
              <label htmlFor={`waiting-text-${key}`}>
                <span>{t(`admin.waiting.texts.${key}`)}</span>
              </label>
              <textarea
                id={`waiting-text-${key}`}
                className="input"
                maxLength={1000}
                value={drafts[key] ?? data.texts[key]}
                onChange={(event) => {
                  setDrafts({ ...drafts, [key]: event.target.value });
                }}
              />
              {(data.custom[key] ||
                (drafts[key] ?? data.texts[key]) !== DEFAULT_WAITING_TEXTS[key]) && (
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`${t("admin.waiting.reset")}: ${t(`admin.waiting.texts.${key}`)}`}
                  onClick={() => {
                    setDrafts({ ...drafts, [key]: undefined });
                    void change({ texts: { [key]: null } }, "texts");
                  }}
                >
                  {t("admin.waiting.reset")}
                </button>
              )}
            </div>
          ))}
          <div className="row">
            <button type="submit" className="btn soft sm">
              {t("admin.waiting.saveTexts")}
            </button>
            {saved === "texts" && (
              <span role="status" className="hint">
                {t("admin.waiting.saved")}
              </span>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
