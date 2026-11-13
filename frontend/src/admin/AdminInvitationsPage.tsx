// Einladungen (sw-architecture.md 8.3, 9): the admin creates personal invitations in a batch,
// revokes and replaces them, and prints the cards (INV-01, INV-04, INV-05, INV-14). The plain
// code exists only in the response that creates or regenerates it, so the print view comes
// right away and not again. Each invitation states the program items it is for (RSVP-02).
import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  createInvitationsResponseSchema,
  INVITATION_STATUSES,
  invitationListSchema,
  issuedInvitationSchema,
  PERSON_TYPES,
  rsvpConfigSchema,
} from "@zappaloo/shared";
import type { InvitationStatus, IssuedInvitation, PersonType } from "@zappaloo/shared";
import { fieldText } from "../app/forms.ts";
import QrCode from "../app/QrCode.tsx";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { ToggleChip } from "./ui.tsx";

const STATUS_TAG: Record<InvitationStatus, string> = {
  active: "tag",
  redeemed: "tag ok",
  expired: "tag warn",
  revoked: "tag bad",
  replaced: "tag line",
};

/** The guest names of the text field, one per line. */
function guestNames(text: string): string[] {
  return text
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** The print view: shown once, right after creating or regenerating (INV-14). */
function PrintView({ cards, onDone }: { cards: IssuedInvitation[]; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="sethead no-print">
        <div className="grow">
          <h1 className="h1">{t("admin.invitations.created", { count: cards.length })}</h1>
          <span className="muted sm">{t("admin.invitations.cardsHint")}</span>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            window.print();
          }}
        >
          {t("admin.invitations.print")}
        </button>
      </div>
      <div className="invitation-cards">
        {cards.map((card) => (
          <article key={card.id} className="invitation-card">
            <h2>{card.guestName}</h2>
            <QrCode
              value={card.url}
              label={t("admin.invitations.qrLabel", { name: card.guestName })}
            />
            <p className="invitation-code">{card.code}</p>
            <p>{card.url}</p>
          </article>
        ))}
      </div>
      <button type="button" className="btn ghost sm no-print" onClick={onDone}>
        {t("admin.invitations.done")}
      </button>
    </>
  );
}

export default function AdminInvitationsPage() {
  const { t, i18n } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData("/api/admin/invitations", invitationListSchema);
  const { data: config } = useAdminData("/api/admin/rsvp/config", rsvpConfigSchema);
  const programItems = config?.programItems ?? [];
  /** The person type of the new batch (RSVP-13). */
  const [batchType, setBatchType] = useState<PersonType>("adult");
  /** The invited program items of an invitation, in the order of the program. */
  const invited = (invitation: { programItemIds: number[] }) =>
    programItems.filter((programItem) => invitation.programItemIds.includes(programItem.id));
  /** The program items chosen for the new batch; every program item until the admin chooses. */
  const [chosen, setChosen] = useState<number[]>();
  /** True while revoking, cleaning up or regenerating runs: a second click does nothing. */
  const busy = useRef(false);
  const batchProgramItems = chosen ?? programItems.map((programItem) => programItem.id);
  const [cards, setCards] = useState<IssuedInvitation[]>([]);
  const [names, setNames] = useState("");
  const [filter, setFilter] = useState<InvitationStatus>();
  const [error, setError] = useState<string>();

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expires = fieldText(form, "expiresAt");
    const result = await call("POST", "/api/admin/invitations", {
      guests: guestNames(names).map((name) => ({ name })),
      ...(programItems.length > 0 ? { programItemIds: batchProgramItems } : {}),
      personType: batchType,
      // Valid through the chosen day, in the admin's time zone.
      ...(expires === "" ? {} : { expiresAt: new Date(`${expires}T23:59:59`).toISOString() }),
    });
    const parsed = createInvitationsResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setCards(parsed.data.invitations);
      setError(undefined);
      setNames("");
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  /** The code whose revoking removes the guest and waits for the second click (INV-20). */
  const [confirmRemove, setConfirmRemove] = useState<number>();

  async function revoke(id: number) {
    if (busy.current) return;
    busy.current = true;
    const result = await call("POST", `/api/admin/invitations/${String(id)}/revoke`);
    busy.current = false;
    setConfirmRemove(undefined);
    setError(result.ok ? undefined : errorText(result.errorCode));
    reload();
  }

  /** "Aufräumen" (INV-21) deletes revoked and replaced codes after a second click. */
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  async function cleanup() {
    if (busy.current) return;
    busy.current = true;
    const result = await call("POST", "/api/admin/invitations/cleanup");
    busy.current = false;
    setConfirmCleanup(false);
    setError(result.ok ? undefined : errorText(result.errorCode));
    reload();
  }

  async function regenerate(id: number) {
    if (busy.current) return;
    busy.current = true;
    const result = await call("POST", `/api/admin/invitations/${String(id)}/regenerate`);
    busy.current = false;
    const parsed = issuedInvitationSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setCards([parsed.data]);
      setError(undefined);
    } else {
      setError(errorText(result.errorCode));
    }
    reload();
  }

  if (cards.length > 0) {
    return (
      <PrintView
        cards={cards}
        onDone={() => {
          setCards([]);
        }}
      />
    );
  }

  const invitations = data?.invitations ?? [];
  const count = (status: InvitationStatus | undefined) =>
    status === undefined
      ? invitations.length
      : invitations.filter((invitation) => invitation.status === status).length;
  const shown =
    filter === undefined
      ? invitations
      : invitations.filter((invitation) => invitation.status === filter);
  const guests = guestNames(names).length;

  return (
    <>
      <h1 className="h1">{t("admin.invitations.title")}</h1>
      <form className="card" onSubmit={(event) => void create(event)}>
        <b>{t("admin.invitations.new")}</b>
        <label className="field">
          <span>{t("admin.invitations.names")}</span>
          <textarea
            className="input"
            name="names"
            required
            value={names}
            onChange={(event) => {
              setNames(event.target.value);
            }}
          />
        </label>
        <div className="field" role="group" aria-label={t("admin.invitations.programItems")}>
          <span>{t("admin.invitations.programItems")}</span>
          {programItems.length === 0 ? (
            <span className="hint">{t("admin.invitations.programItemsNone")}</span>
          ) : (
            <div className="chips">
              {programItems.map((programItem) => (
                <ToggleChip
                  key={programItem.id}
                  pressed={batchProgramItems.includes(programItem.id)}
                  onToggle={() => {
                    setChosen(
                      batchProgramItems.includes(programItem.id)
                        ? batchProgramItems.filter((id) => id !== programItem.id)
                        : [...batchProgramItems, programItem.id],
                    );
                  }}
                >
                  {programItem.name}
                </ToggleChip>
              ))}
            </div>
          )}
        </div>
        <div className="field" role="group" aria-label={t("admin.personType")}>
          <span>{t("admin.personType")}</span>
          <div className="chips">
            {PERSON_TYPES.map((personType) => (
              <ToggleChip
                key={personType}
                pressed={batchType === personType}
                onToggle={() => {
                  setBatchType(personType);
                }}
              >
                {t(`personTypes.${personType}`)}
              </ToggleChip>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t("admin.invitations.expiresAt")}</span>
          <input className="input auto" name="expiresAt" type="date" />
        </label>
        <button
          type="submit"
          className="btn"
          disabled={guests === 0 || (programItems.length > 0 && batchProgramItems.length === 0)}
        >
          {guests === 0
            ? t("admin.invitations.createNone")
            : t("admin.invitations.create", { count: guests })}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="card tight">
        <div className="row tight-head">
          <div className="chips" role="group" aria-label={t("admin.invitations.filter")}>
            {[undefined, ...INVITATION_STATUSES].map((status) => (
              <button
                key={status ?? "all"}
                type="button"
                className="chip"
                aria-pressed={filter === status}
                onClick={() => {
                  setFilter(status);
                }}
              >
                {status === undefined
                  ? t("admin.invitations.all")
                  : t(`admin.invitations.statuses.${status}`)}{" "}
                {count(status)}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.invitations.guest")}</th>
                <th>{t("admin.invitations.programItemsColumn")}</th>
                <th>{t("admin.personType")}</th>
                <th>{t("admin.invitations.status")}</th>
                <th>
                  <span className="visually-hidden">{t("admin.invitations.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((invitation) => (
                <tr key={invitation.id}>
                  <td>
                    {invitation.guestName}
                    {invitation.expiresAt && (
                      <>
                        <br />
                        <span className="hint">
                          {t("admin.invitations.validUntil", {
                            date: new Date(invitation.expiresAt).toLocaleDateString(i18n.language),
                          })}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    {/* One letter per invited program item, read only. The account panel changes them. */}
                    <abbr
                      title={invited(invitation)
                        .map((programItem) => programItem.name)
                        .join(", ")}
                      aria-label={`${t("admin.invitations.programItemsColumn")}: ${invited(
                        invitation,
                      )
                        .map((programItem) => programItem.name)
                        .join(", ")}`}
                    >
                      {invited(invitation)
                        .map((programItem) => programItem.name.charAt(0).toUpperCase())
                        .join(" ") || "–"}
                    </abbr>
                  </td>
                  <td>
                    <abbr
                      title={t(`personTypes.${invitation.personType}`)}
                      aria-label={`${t("admin.personType")}: ${t(`personTypes.${invitation.personType}`)}`}
                    >
                      {t(`personTypesShort.${invitation.personType}`)}
                    </abbr>
                  </td>
                  <td>
                    <span className={STATUS_TAG[invitation.status]}>
                      {t(`admin.invitations.statuses.${invitation.status}`)}
                    </span>
                  </td>
                  <td className="actions">
                    {(invitation.status === "active" || invitation.status === "expired") && (
                      <button
                        type="button"
                        className="btn soft sm"
                        aria-label={`${t("admin.invitations.regenerate")}: ${invitation.guestName}`}
                        onClick={() => void regenerate(invitation.id)}
                      >
                        {t("admin.invitations.regenerate")}
                      </button>
                    )}{" "}
                    {invitation.status === "active" &&
                      (confirmRemove === invitation.id ? (
                        <span className="row" role="alertdialog" aria-label={invitation.guestName}>
                          <button
                            type="button"
                            className="btn danger sm"
                            onClick={() => void revoke(invitation.id)}
                          >
                            {t("admin.invitations.revokeAndRemove")}
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => {
                              setConfirmRemove(undefined);
                            }}
                          >
                            {t("admin.cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn ghost sm"
                          aria-label={`${t("admin.invitations.revoke")}: ${invitation.guestName}`}
                          onClick={() => {
                            if (invitation.removesGuest) setConfirmRemove(invitation.id);
                            else void revoke(invitation.id);
                          }}
                        >
                          {t("admin.invitations.revoke")}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {count("revoked") + count("replaced") > 0 && (
          <div className="row tight-foot">
            {confirmCleanup ? (
              <span
                className="row"
                role="alertdialog"
                aria-label={t("admin.invitations.cleanupFinal")}
              >
                <span className="sm">
                  {t("admin.invitations.cleanupConfirm", {
                    count: count("revoked") + count("replaced"),
                  })}
                </span>
                <button type="button" className="btn danger sm" onClick={() => void cleanup()}>
                  {t("admin.invitations.cleanupFinal")}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    setConfirmCleanup(false);
                  }}
                >
                  {t("admin.cancel")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn soft sm"
                onClick={() => {
                  setConfirmCleanup(true);
                }}
              >
                {t("admin.invitations.cleanup", { count: count("revoked") + count("replaced") })}
              </button>
            )}
          </div>
        )}

        {count("revoked") + count("replaced") > 0 && (
          <span className="hint tight-foot">{t("admin.invitations.cleanupHint")}</span>
        )}
      </div>
    </>
  );
}
