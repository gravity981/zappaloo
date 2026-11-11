// Einstellungen (sw-architecture.md 8.3): one page with sections. In stage 2 the feature
// switches (CFG-03, CFG-05); opening the platform, RSVP, waiting page texts, links and guest
// profiles come with their steps.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FEATURE_NAMES } from "@zappaloo/shared";
import type { FeatureName } from "@zappaloo/shared";
import { useEvent } from "../app/event.ts";
import { useErrorText, useEventUpdate } from "./data.ts";
import { Switch } from "./ui.tsx";

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const event = useEvent();
  const update = useEventUpdate();
  const errorText = useErrorText();
  const [pending, setPending] = useState<FeatureName>();
  const [error, setError] = useState<string>();

  async function change(feature: FeatureName, enabled: boolean) {
    setPending(feature);
    const failed = await update({ features: { [feature]: enabled } });
    setPending(undefined);
    setError(failed && errorText(failed));
  }

  return (
    <>
      <h1 className="h1">{t("admin.settings.title")}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {event && (
        <div className="grid-2">
          <section className="card" aria-labelledby="features-title">
            <b id="features-title">{t("admin.settings.features")}</b>
            <span className="hint">{t("admin.settings.featuresHint")}</span>
            {FEATURE_NAMES.map((feature) => (
              <div key={feature} className="setrow">
                <div className="grow">
                  <b className="sm">{t(`admin.features.${feature}`)}</b>
                </div>
                <Switch
                  checked={event.features[feature]}
                  label={t(`admin.features.${feature}`)}
                  disabled={pending !== undefined}
                  onChange={(enabled) => void change(feature, enabled)}
                />
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
