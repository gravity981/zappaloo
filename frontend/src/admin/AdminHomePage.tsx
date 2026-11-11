// Übersicht (sw-architecture.md 8.3): the state of the platform at a glance, and the upload
// switches (CFG-05, PHO-18). Further tiles (RSVPs, moderation, companion requests) come with
// their features.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingName } from "@zappaloo/shared";
import { useEvent } from "../app/event.ts";
import { useErrorText, useEventUpdate } from "./data.ts";
import { Switch } from "./ui.tsx";

const UPLOADS = [
  { setting: "snapshotUploadsOpen", feature: "snapshots", label: "admin.home.snapshots" },
  { setting: "keepsakeUploadsOpen", feature: "keepsakes", label: "admin.home.keepsakes" },
] as const;

export default function AdminHomePage() {
  const { t } = useTranslation();
  const event = useEvent();
  const update = useEventUpdate();
  const errorText = useErrorText();
  const [pending, setPending] = useState<SettingName>();
  const [error, setError] = useState<string>();

  async function change(setting: SettingName, value: boolean) {
    setPending(setting);
    const failed = await update({ settings: { [setting]: value } });
    setPending(undefined);
    setError(failed && errorText(failed));
  }

  const open = event?.settings.platformOpen;
  return (
    <>
      <h1 className="h1">{t("admin.home.title")}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="kpis">
        <div className={open === false ? "kpi alert" : "kpi"}>
          <span className="eyebrow">{t("admin.home.platform")}</span>
          <b>{open === undefined ? "–" : open ? t("admin.home.open") : t("admin.home.closed")}</b>
        </div>
      </div>
      {event && (
        <div className="card">
          <b>{t("admin.home.uploads")}</b>
          {UPLOADS.map(({ setting, feature, label }) => {
            const on = event.settings[setting];
            return (
              <div key={setting} className="setrow">
                <div className="grow">
                  <b className="sm">{t(label)}</b>
                  <span className="hint">
                    {on ? t("admin.home.open") : t("admin.home.closed")}
                    {!event.features[feature] && ` · ${t("admin.home.featureOff")}`}
                  </span>
                </div>
                <Switch
                  checked={on}
                  label={t(label)}
                  disabled={pending !== undefined}
                  onChange={(value) => void change(setting, value)}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
