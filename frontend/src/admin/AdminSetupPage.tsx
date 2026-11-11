// Event setup (CFG-02, sw-architecture.md 19.3.1): on a fresh installation an admin sees only
// this form. Saving completes the setup and the admin area opens. After the admin mock "Event
// setup".
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { eventResponseSchema } from "@zappaloo/shared";
import { useSetEvent } from "../app/event.ts";
import { useAdminCall } from "./data.ts";
import EventIdentityForm from "./EventIdentityForm.tsx";
import { DEFAULT_IDENTITY } from "./identity.ts";
import type { EventIdentity } from "./identity.ts";

export default function AdminSetupPage() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const setEvent = useSetEvent();

  const save = useCallback(
    async (values: EventIdentity): Promise<string | undefined> => {
      const result = await call("POST", "/api/admin/event/setup", values);
      const parsed = eventResponseSchema.safeParse(result.body);
      if (result.ok && parsed.success) {
        setEvent(parsed.data);
        return undefined;
      }
      return result.errorCode ?? "unknown";
    },
    [call, setEvent],
  );

  return (
    <>
      <h1 className="h1">{t("admin.setup.title")}</h1>
      <section className="card strong">
        <p className="muted">{t("admin.setup.intro")}</p>
        <EventIdentityForm
          initial={DEFAULT_IDENTITY}
          submitLabel={t("admin.setup.submit")}
          onSubmit={save}
        />
      </section>
    </>
  );
}
