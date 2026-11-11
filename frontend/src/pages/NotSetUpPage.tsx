// Shown to everyone but admins until the admin has set the event up (CFG-02, 19.3.1; UX mock
// `admin-setup`, variant "everyone else"): a neutral page with the way to sign out.
import { useTranslation } from "react-i18next";
import { useSession } from "../app/session.ts";
import { BareShell } from "../guest/Shells.tsx";

export default function NotSetUpPage() {
  const { t } = useTranslation();
  const session = useSession();
  return (
    <BareShell>
      <h1 className="h1" style={{ textAlign: "center" }}>
        {t("notSetUp.title")}
      </h1>
      <p className="muted" style={{ textAlign: "center" }}>
        {t("notSetUp.text")}
      </p>
      <button type="button" className="btn ghost" onClick={() => void session.logout()}>
        {t("nav.logout")}
      </button>
    </BareShell>
  );
}
