// Add the site to the home screen (PWA-05; UX mock `install`): a flow page opened from the strip
// on the waiting page and from the card in the profile. Android installs with the browser's
// prompt, iOS has the steps of the Share menu. Without anything to do (the installed app, a
// desktop browser) it leads back to the start page.
import { Trans, useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { useInstall } from "../app/install.ts";
import { FlowShell } from "../guest/Shells.tsx";
import { useSiteName } from "../guest/site.ts";
import { AddIcon, InstallTile, ShareIcon } from "../guest/install-icons.tsx";

export default function InstallPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { available, platform, canPrompt, install } = useInstall();
  const name = useSiteName() ?? t("app.name");
  if (!available) return <Navigate to="/" replace />;
  const ios = platform === "ios";
  const back = () => {
    void navigate(-1);
  };

  const footer = ios ? (
    <button type="button" className="btn" onClick={back}>
      {t("install.understood")}
    </button>
  ) : canPrompt ? (
    <>
      <button type="button" className="btn ghost" onClick={back}>
        {t("install.later")}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          void install().then(back);
        }}
      >
        {t("install.install")}
      </button>
    </>
  ) : (
    <button type="button" className="btn" onClick={back}>
      {t("install.understood")}
    </button>
  );

  return (
    <FlowShell
      title={t("install.title")}
      closeTo="/"
      closeLabel={t("install.close")}
      footer={footer}
    >
      <div className="guest-flow-page stack">
        <InstallTile name={name} />
        <p>{t("install.intro")}</p>
        <section className="card" aria-labelledby="install-steps">
          <b id="install-steps">{ios ? t("install.ios.title") : t("install.android.title")}</b>
          {ios ? (
            <ol className="steps">
              <li>
                <Trans i18nKey="install.ios.step1" components={{ icon: <ShareIcon />, b: <b /> }} />
              </li>
              <li>
                <Trans i18nKey="install.ios.step2" components={{ icon: <AddIcon />, b: <b /> }} />
              </li>
              <li>
                <Trans i18nKey="install.ios.step3" components={{ b: <b /> }} />
              </li>
            </ol>
          ) : canPrompt ? (
            <ol className="steps">
              <li>
                <Trans i18nKey="install.android.step1" components={{ b: <b /> }} />
              </li>
              <li>{t("install.android.step2")}</li>
            </ol>
          ) : (
            <ol className="steps">
              <li>{t("install.android.menu1")}</li>
              <li>
                <Trans i18nKey="install.android.menu2" components={{ b: <b /> }} />
              </li>
            </ol>
          )}
          <span className="hint">{ios ? t("install.ios.hint") : t("install.android.hint")}</span>
        </section>
        <section className="card" aria-labelledby="install-note">
          <b id="install-note">{t("install.noteTitle")}</b>
          <span className="hint">{ios ? t("install.noteIos") : t("install.noteAndroid")}</span>
        </section>
      </div>
    </FlowShell>
  );
}
