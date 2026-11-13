// Rückmeldungen (RSVP-05, RSVP-07, SEC-11; sw-architecture.md 8.3, 7.4.1): totals per program item,
// the menus of the meal program item, the guest table with the admin-only allergy column, the CSV
// export and reminders. A row opens the RSVP wizard in admin mode.
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PERSON_TYPES, remindResponseSchema, rsvpOverviewSchema } from "@zappaloo/shared";
import type { PersonType, RsvpStatus } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { notifyRsvpChanged } from "./pending.ts";

/** The filter chips: all guests, or one status. */
const FILTERS: (RsvpStatus | undefined)[] = [undefined, "attending", "declined", "none"];

/** Marks a companion's row under their guest. */
const ARROW = "↳";

const STATUS_TAG: Record<RsvpStatus, string> = {
  attending: "tag ok",
  declined: "tag bad",
  none: "tag",
};

export default function AdminRsvpPage() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, failed, reload } = useAdminData("/api/admin/rsvp", rsvpOverviewSchema);
  const [filter, setFilter] = useState<RsvpStatus>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  /** While a request runs its buttons are off, so a double click sends nothing twice. */
  const [busy, setBusy] = useState<"remind" | number>();
  /** The accompanying person whose removal waits for the second click. */
  const [removing, setRemoving] = useState<number>();

  async function decide(id: number, decision: "approve" | "reject") {
    setBusy(id);
    const result = await call("POST", `/api/admin/rsvp/companions/${String(id)}/${decision}`);
    setBusy(undefined);
    setMessage(result.ok ? undefined : { ok: false, text: errorText(result.errorCode) });
    reload();
    notifyRsvpChanged();
  }

  /** "35 Erwachsene, 5 Kinder": the types that are there (RSVP-15). */
  const byType = (counts: Record<PersonType, number>) =>
    PERSON_TYPES.filter((type) => counts[type] > 0)
      .map((type) => t(`personTypesCount.${type}`, { count: counts[type] }))
      .join(", ");
  /** "42 ja (37 Erwachsene, 5 Kinder) · 3 nein". */
  const yesNo = (total: { yes: number; no: number; yesByType: Record<PersonType, number> }) =>
    t("admin.rsvp.yesNo", {
      yes: total.yes,
      no: total.no,
      types: total.yes > 0 ? ` (${byType(total.yesByType)})` : "",
    });

  async function removeCompanion(id: number) {
    setBusy(id);
    const result = await call("DELETE", `/api/admin/rsvp/companions/${String(id)}`);
    setBusy(undefined);
    setRemoving(undefined);
    setMessage(result.ok ? undefined : { ok: false, text: errorText(result.errorCode) });
    reload();
    notifyRsvpChanged();
  }

  async function remind() {
    if (!data) return;
    setBusy("remind");
    const result = await call("POST", "/api/admin/rsvp/remind");
    setBusy(undefined);
    const parsed = remindResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setMessage({ ok: true, text: t("admin.rsvp.reminded", { count: parsed.data.sent }) });
      reload();
    } else {
      setMessage({ ok: false, text: errorText(result.errorCode) });
    }
  }

  if (failed) {
    return (
      <>
        <h1 className="h1">{t("admin.rsvp.title")}</h1>
        <p role="alert" className="error">
          {errorText(failed)}
        </p>
      </>
    );
  }
  if (!data) return <h1 className="h1">{t("admin.rsvp.title")}</h1>;

  const meal = data.programItems.find((programItem) => programItem.hasMeal);
  const programItemName = (id: number) =>
    data.programItems.find((programItem) => programItem.id === id)?.name ?? "";
  const menuName = (id: number | null) =>
    id === null
      ? t("admin.rsvp.noChoice")
      : (data.menus.find((menu) => menu.id === id)?.name ?? "");
  const count = (status: RsvpStatus | undefined) =>
    status === undefined
      ? data.guests.length
      : data.guests.filter((guest) => guest.status === status).length;
  const shown = filter === undefined ? data.guests : data.guests.filter((g) => g.status === filter);
  // One answer for everyone: one bar that counts persons (guests are invited to different program
  // items, so no program item has everyone). Per program item: one bar each.
  const bars = data.perItem
    ? data.totals
    : data.programItems.length > 0
      ? [{ programItemId: 0, ...data.personTotals }]
      : [];
  const widest = Math.max(1, ...bars.map((total) => total.yes + total.no));
  const menuWidest = Math.max(1, ...data.menuTotals.map((total) => total.count));

  return (
    <>
      <div className="sethead">
        <h1 className="h1 grow">{t("admin.rsvp.title")}</h1>
        <a className="btn soft sm" href="/api/admin/rsvp/export" download>
          {t("admin.rsvp.csv")}
        </a>
        <button
          type="button"
          className="btn sm"
          disabled={data.reminderCount === 0 || busy === "remind"}
          onClick={() => void remind()}
        >
          {t("admin.rsvp.remind", { count: data.reminderCount })}
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "hint" : "error"}>
          {message.text}
        </p>
      )}

      {data.companionApproval && data.pendingCount > 0 && (
        <section className="card strong" aria-labelledby="rsvp-requests">
          <b id="rsvp-requests">{t("admin.rsvp.requests", { count: data.pendingCount })}</b>
          <ul className="list">
            {data.companions
              .filter((c) => c.status === "pending")
              .map((c) => (
                <li key={c.id} className="li">
                  <div className="grow">
                    <b>{c.name}</b>
                    <span className="hint">
                      {t("admin.rsvp.requestFrom", { name: c.hostName })}
                      {c.note && ` · «${c.note}»`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={`${t("admin.rsvp.reject")}: ${c.name}`}
                    disabled={busy === c.id}
                    onClick={() => void decide(c.id, "reject")}
                  >
                    {t("admin.rsvp.reject")}
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`${t("admin.rsvp.approve")}: ${c.name}`}
                    disabled={busy === c.id}
                    onClick={() => void decide(c.id, "approve")}
                  >
                    {t("admin.rsvp.approve")}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="grid-2">
        <section className="card" aria-labelledby="rsvp-per-program-item">
          <b id="rsvp-per-program-item">
            {t(data.perItem ? "admin.rsvp.perProgramItem" : "admin.rsvp.overview")}
          </b>
          {data.programItems.length === 0 && (
            <span className="hint">{t("admin.rsvp.noProgramItems")}</span>
          )}
          {bars.map((total) => (
            <div key={total.programItemId} className={data.perItem ? "bar-row" : "bar-row single"}>
              {data.perItem && <span>{programItemName(total.programItemId)}</span>}
              <div className="track" aria-hidden="true">
                <i style={{ width: `${String((total.yes / widest) * 100)}%` }} />
                <i className="no" style={{ width: `${String((total.no / widest) * 100)}%` }} />
              </div>
              <span className="sm">{yesNo(total)}</span>
            </div>
          ))}
        </section>
        <section className="card" aria-labelledby="rsvp-menus">
          <b id="rsvp-menus">
            {meal ? t("admin.rsvp.menus", { programItem: meal.name }) : t("admin.rsvp.menusNoMeal")}
          </b>
          {!meal && <span className="hint">{t("admin.rsvp.noMealProgramItem")}</span>}
          {data.menuTotals.map((total) => (
            <div key={total.menuId ?? "none"} className="bar-row">
              <span>{menuName(total.menuId)}</span>
              <div className="track" aria-hidden="true">
                <i style={{ width: `${String((total.count / menuWidest) * 100)}%` }} />
              </div>
              <span className="sm">{total.count}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="card tight" aria-labelledby="rsvp-guests">
        <div className="row tight-head">
          <b id="rsvp-guests" className="grow">
            {t("admin.rsvp.guests")}
          </b>
          <div className="chips" role="group" aria-label={t("admin.rsvp.filter")}>
            {FILTERS.map((status) => (
              <button
                key={status ?? "all"}
                type="button"
                className="chip"
                aria-pressed={filter === status}
                onClick={() => {
                  setFilter(status);
                }}
              >
                {status === undefined ? t("admin.rsvp.all") : t(`admin.rsvp.statuses.${status}`)}{" "}
                {count(status)}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.rsvp.name")}</th>
                <th>{t("admin.rsvp.type")}</th>
                <th>{t("admin.rsvp.status")}</th>
                <th>{t("admin.rsvp.programItems")}</th>
                <th>{t("admin.rsvp.menu")}</th>
                {data.songEnabled && <th>{t("admin.rsvp.song")}</th>}
                <th>🔒 {t("admin.rsvp.allergies")}</th>
                <th>
                  <span className="visually-hidden">{t("admin.rsvp.edit")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={data.songEnabled ? 8 : 7}>{t("admin.rsvp.noGuests")}</td>
                </tr>
              )}
              {shown.map((guest) => (
                <Fragment key={guest.userId}>
                  <tr>
                    <td>
                      <b>{guest.name}</b>
                    </td>
                    <td className="sm">{t(`personTypes.${guest.personType}`)}</td>
                    <td>
                      <span className={STATUS_TAG[guest.status]}>
                        {t(`admin.rsvp.statuses.${guest.status}`)}
                      </span>
                    </td>
                    <td>
                      {guest.attendingItemIds.map(programItemName).join(", ") ||
                        t("admin.rsvp.none")}
                    </td>
                    <td>
                      {meal && guest.attendingItemIds.includes(meal.id)
                        ? menuName(guest.menuId)
                        : t("admin.rsvp.none")}
                    </td>
                    {data.songEnabled && <td>{guest.songWish ?? t("admin.rsvp.none")}</td>}
                    <td>{guest.allergies ?? t("admin.rsvp.none")}</td>
                    <td className="actions">
                      <Link
                        className="btn soft sm"
                        to={`/admin/rsvp/guests/${String(guest.userId)}`}
                        aria-label={`${t("admin.rsvp.edit")}: ${guest.name}`}
                      >
                        {t("admin.rsvp.edit")}
                      </Link>
                    </td>
                  </tr>
                  {data.companions
                    .filter((c) => c.hostUserId === guest.userId && c.status === "approved")
                    .map((c) => (
                      <tr key={`c${String(c.id)}`}>
                        <td>
                          {ARROW} <b>{c.name}</b>
                          <br />
                          <span className="hint">
                            {t("admin.rsvp.companionOf", { name: guest.name })}
                          </span>
                        </td>
                        <td className="sm">{t(`personTypes.${c.personType}`)}</td>
                        <td>
                          {data.companionApproval && (
                            <span className="tag ok">
                              {t("admin.rsvp.companionStatus.approved")}
                            </span>
                          )}
                        </td>
                        <td>
                          {c.attendingItemIds.map(programItemName).join(", ") ||
                            t("admin.rsvp.none")}
                        </td>
                        <td>
                          {meal && c.attendingItemIds.includes(meal.id)
                            ? menuName(c.menuId)
                            : t("admin.rsvp.none")}
                        </td>
                        {data.songEnabled && <td>{t("admin.rsvp.none")}</td>}
                        <td>{c.allergies ?? t("admin.rsvp.none")}</td>
                        <td className="actions">
                          {removing === c.id ? (
                            <span className="row" role="alertdialog" aria-label={c.name}>
                              <button
                                type="button"
                                className="btn danger sm"
                                disabled={busy === c.id}
                                onClick={() => void removeCompanion(c.id)}
                              >
                                {t("admin.rsvp.removeFinal")}
                              </button>
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => {
                                  setRemoving(undefined);
                                }}
                              >
                                {t("admin.cancel")}
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn ghost sm"
                              aria-label={`${t("admin.rsvp.remove")}: ${c.name}`}
                              onClick={() => {
                                setRemoving(c.id);
                              }}
                            >
                              {t("admin.rsvp.remove")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <span className="hint tight-foot">{t("admin.rsvp.hint")}</span>
      </section>
    </>
  );
}
