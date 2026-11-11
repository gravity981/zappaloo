// Übersicht (sw-architecture.md 8.3): the state of the platform at a glance, the RSVP count, the
// latest changes (DATA-05) and the upload switches (CFG-05, PHO-18). Further tiles (moderation,
// companion requests) come with their features.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingName } from "@zappaloo/shared";
import { activityResponseSchema, rsvpOverviewSchema } from "@zappaloo/shared";
import { Link } from "react-router";
import { useEvent } from "../app/event.ts";
import { activityText, relativeTime } from "./activity.ts";
import { useAdminData, useErrorText, useEventUpdate } from "./data.ts";
import { Switch } from "./ui.tsx";

const UPLOADS = [
  { setting: "snapshotUploadsOpen", feature: "snapshots", label: "admin.home.snapshots" },
  { setting: "keepsakeUploadsOpen", feature: "keepsakes", label: "admin.home.keepsakes" },
] as const;

/** The tile "Rückmeldungen x / y" with the number of guests who have not answered (RSVP-05). */
function RsvpKpi() {
  const { t } = useTranslation();
  const { data } = useAdminData("/api/admin/rsvp", rsvpOverviewSchema);
  return (
    <>
      <div className="kpi">
        <span className="eyebrow">{t("admin.home.rsvp")}</span>
        <b>
          {data ? t("admin.home.rsvpValue", { answered: data.answered, total: data.total }) : "–"}
        </b>
        {data && (
          <span className="hint">
            {t("admin.home.rsvpHint", { count: data.total - data.answered })}
          </span>
        )}
        <Link className="sm" to="/admin/rsvp">
          {t("admin.home.rsvpOpen")}
        </Link>
      </div>
      <div className={data?.pendingCount ? "kpi alert" : "kpi"}>
        <span className="eyebrow">{t("admin.home.companions")}</span>
        <b>
          {data
            ? data.pendingCount > 0
              ? t("admin.home.companionsValue", { count: data.pendingCount })
              : t("admin.home.companionsNone")
            : "–"}
        </b>
        {data && data.pendingCount > 0 && (
          <Link className="sm" to="/admin/rsvp">
            {t("admin.home.companionsDecide")}
          </Link>
        )}
      </div>
    </>
  );
}

/** The card "Zuletzt": the latest guest-related and settings changes (DATA-05). */
function ActivityCard() {
  const { t, i18n } = useTranslation();
  const { data } = useAdminData("/api/admin/activity", activityResponseSchema);
  return (
    <section className="card" aria-labelledby="activity-title">
      <b id="activity-title">{t("admin.home.activity")}</b>
      {data?.entries.length === 0 && <span className="hint">{t("admin.home.activityNone")}</span>}
      <ul className="list sm">
        {data?.entries.map((entry) => (
          <li key={`${entry.action}-${entry.createdAt}`} className="li">
            <span className="grow">{activityText(t, entry)}</span>
            <span className="hint">{relativeTime(entry.createdAt, i18n.language)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
          {open === false && (
            <Link className="btn sm" to="/admin/settings">
              {t("admin.home.openLink")}
            </Link>
          )}
        </div>
        {event?.features.rsvp && <RsvpKpi />}
      </div>
      <div className="grid-2">
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
        <ActivityCard />
      </div>
    </>
  );
}
