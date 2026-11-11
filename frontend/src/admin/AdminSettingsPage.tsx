// Einstellungen (sw-architecture.md 8.3): one page with sections. In stage 2 the event's
// name, time zone and language (CFG-06), the RSVP settings (RSVP-02, RSVP-03, RSVP-04) and the
// feature switches (CFG-03, CFG-05); opening the platform, waiting page texts, privacy notice,
// links and guest profiles come with their steps.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FEATURE_NAMES } from "@zappaloo/shared";
import type { FeatureName } from "@zappaloo/shared";
import { useEvent } from "../app/event.ts";
import { useErrorText, useEventUpdate } from "./data.ts";
import EventIdentityForm from "./EventIdentityForm.tsx";
import { identityOf } from "./identity.ts";
import type { EventIdentity } from "./identity.ts";
import FooterSettingsCard from "./FooterSettingsCard.tsx";
import PrivacySettingsCard from "./PrivacySettingsCard.tsx";
import RsvpSettingsCard from "./RsvpSettingsCard.tsx";
import WaitingSettingsCards from "./WaitingSettingsCards.tsx";
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

  /** Sends only what changed. */
  const saveIdentity = (values: EventIdentity): Promise<string | undefined> =>
    update({
      ...(values.name !== event?.name && { name: values.name }),
      ...(values.timezone !== event?.timezone && { timezone: values.timezone }),
      ...(values.defaultLanguage !== event?.defaultLanguage && {
        defaultLanguage: values.defaultLanguage,
      }),
    });

  return (
    <>
      <h1 className="h1">{t("admin.settings.title")}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {event?.setupComplete && (
        <section className="card" aria-labelledby="identity-title">
          <b id="identity-title">{t("admin.identity.title")}</b>
          <span className="hint">{t("admin.identity.hint")}</span>
          <EventIdentityForm
            initial={identityOf(event)}
            submitLabel={t("admin.identity.save")}
            onSubmit={saveIdentity}
          />
        </section>
      )}
      {event?.setupComplete && <WaitingSettingsCards />}
      {event?.setupComplete && <PrivacySettingsCard />}
      {event?.setupComplete && <FooterSettingsCard />}
      {event && (
        <div className="grid-2">
          <RsvpSettingsCard />
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
