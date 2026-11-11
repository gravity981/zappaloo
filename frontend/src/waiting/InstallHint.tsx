// The strip on the waiting page that offers the home screen (PWA-05; UX mock `waiting`, variant
// "Install hint"): only in a mobile browser, hidden for good with × on this device.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { dismissHint, hintDismissed, useInstall } from "../app/install.ts";

export default function InstallHint({ eventName }: { eventName: string }) {
  const { t } = useTranslation();
  const { available } = useInstall();
  const [dismissed, setDismissed] = useState(hintDismissed);
  if (!available || dismissed) return null;
  return (
    <aside className="waiting-hint" aria-label={t("install.hintLabel")}>
      <span>
        {t("install.hint", { name: eventName })} <Link to="/install">{t("install.howTo")}</Link>
      </span>
      <button
        type="button"
        aria-label={t("install.dismiss")}
        onClick={() => {
          dismissHint();
          setDismissed(true);
        }}
      >
        ×
      </button>
    </aside>
  );
}
