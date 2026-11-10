// The admin creates, revokes and replaces personal invitations and prints the cards
// (INV-01, INV-04, INV-05, INV-14). The plain code exists only in the response that creates
// or regenerates it, so the cards are shown right away and not again.
import { useCallback, useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import {
  createInvitationsResponseSchema,
  invitationListSchema,
  issuedInvitationSchema,
} from "@zappaloo/shared";
import type { Invitation, IssuedInvitation } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { fieldText } from "../app/forms.ts";
import QrCode from "../app/QrCode.tsx";
import { useSession } from "../app/session.ts";

export default function AdminInvitationsPage() {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const [list, setList] = useState<Invitation[]>([]);
  const [cards, setCards] = useState<IssuedInvitation[]>([]);
  const [error, setError] = useState<string>();

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const isAdmin = session.user?.roles.includes("admin") ?? false;
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    apiRequest("GET", "/api/admin/invitations")
      .then((result) => {
        const parsed = invitationListSchema.safeParse(result.body);
        if (!cancelled && result.ok && parsed.success) setList(parsed.data.invitations);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin, version]);

  if (!session.ready) return null;
  if (!isAdmin) return <Navigate to={session.user ? "/" : "/login"} replace />;

  const errorText = (code: string | undefined) =>
    t(`errors.${code ?? "unknown"}`, { defaultValue: t("errors.unknown") });

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const names = fieldText(form, "names")
      .split("\n")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    const expires = fieldText(form, "expiresAt");
    const result = await apiRequest("POST", "/api/admin/invitations", {
      csrfToken: session.csrfToken,
      body: {
        guests: names.map((name) => ({ name })),
        ...(expires === "" ? {} : { expiresAt: new Date(expires).toISOString() }),
      },
    });
    const parsed = createInvitationsResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setCards(parsed.data.invitations);
      setError(undefined);
      formElement.reset();
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  async function revoke(id: number) {
    const result = await apiRequest("POST", `/api/admin/invitations/${String(id)}/revoke`, {
      csrfToken: session.csrfToken,
    });
    setError(result.ok ? undefined : errorText(result.errorCode));
    reload();
  }

  async function regenerate(id: number) {
    const result = await apiRequest("POST", `/api/admin/invitations/${String(id)}/regenerate`, {
      csrfToken: session.csrfToken,
    });
    const parsed = issuedInvitationSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setCards([parsed.data]);
      setError(undefined);
    } else {
      setError(errorText(result.errorCode));
    }
    reload();
  }

  return (
    <section>
      <h1 className="no-print">{t("adminInvitations.title")}</h1>
      <form className="no-print" onSubmit={(event) => void create(event)}>
        <label>
          {t("adminInvitations.names")}
          <textarea name="names" rows={5} required />
        </label>
        <label>
          {t("adminInvitations.expiresAt")}
          <input name="expiresAt" type="datetime-local" />
        </label>
        <button type="submit">{t("adminInvitations.create")}</button>
      </form>
      {error && (
        <p role="alert" className="no-print">
          {error}
        </p>
      )}

      {cards.length > 0 && (
        <div>
          <p className="no-print">{t("adminInvitations.cardsHint")}</p>
          <button
            type="button"
            className="no-print"
            onClick={() => {
              window.print();
            }}
          >
            {t("adminInvitations.print")}
          </button>
          <div className="invitation-cards">
            {cards.map((card) => (
              <article key={card.id} className="invitation-card">
                <h2>{card.guestName}</h2>
                <QrCode
                  value={card.url}
                  label={t("adminInvitations.qrLabel", { name: card.guestName })}
                />
                <p className="invitation-code">{card.code}</p>
                <p>{card.url}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      <table className="no-print">
        <thead>
          <tr>
            <th>{t("adminInvitations.guest")}</th>
            <th>{t("adminInvitations.status")}</th>
            <th>{t("adminInvitations.expires")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((invitation) => (
            <tr key={invitation.id}>
              <td>{invitation.guestName}</td>
              <td>{t(`adminInvitations.statuses.${invitation.status}`)}</td>
              <td>
                {invitation.expiresAt
                  ? new Date(invitation.expiresAt).toLocaleString(i18n.language)
                  : "–"}
              </td>
              <td>
                {(invitation.status === "active" || invitation.status === "expired") && (
                  <>
                    <button type="button" onClick={() => void regenerate(invitation.id)}>
                      {t("adminInvitations.regenerate")}
                    </button>
                    {invitation.status === "active" && (
                      <button type="button" onClick={() => void revoke(invitation.id)}>
                        {t("adminInvitations.revoke")}
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
