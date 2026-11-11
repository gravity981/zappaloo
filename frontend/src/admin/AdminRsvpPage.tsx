// Rückmeldungen (RSVP-05, RSVP-07, SEC-11; sw-architecture.md 8.3, 7.4.1): totals per part,
// the menus of the meal part, the guest table with the admin-only allergy column, the CSV
// export and reminders. A row opens the RSVP wizard in admin mode.
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { remindResponseSchema, rsvpOverviewSchema } from "@zappaloo/shared";
import type { RsvpStatus } from "@zappaloo/shared";
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

  async function decide(id: number, decision: "approve" | "reject") {
    const result = await call("POST", `/api/admin/rsvp/companions/${String(id)}/${decision}`);
    setMessage(result.ok ? undefined : { ok: false, text: errorText(result.errorCode) });
    reload();
    notifyRsvpChanged();
  }

  async function remind() {
    if (!data) return;
    const result = await call("POST", "/api/admin/rsvp/remind");
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

  const meal = data.parts.find((part) => part.hasMeal);
  const partName = (id: number) => data.parts.find((part) => part.id === id)?.name ?? "";
  const menuName = (id: number | null) =>
    id === null
      ? t("admin.rsvp.noChoice")
      : (data.menus.find((menu) => menu.id === id)?.name ?? "");
  const count = (status: RsvpStatus | undefined) =>
    status === undefined
      ? data.guests.length
      : data.guests.filter((guest) => guest.status === status).length;
  const shown = filter === undefined ? data.guests : data.guests.filter((g) => g.status === filter);
  const widest = Math.max(1, ...data.totals.map((total) => total.yes + total.no));
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
          disabled={data.reminderCount === 0}
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

      {data.pendingCount > 0 && (
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
                    onClick={() => void decide(c.id, "reject")}
                  >
                    {t("admin.rsvp.reject")}
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`${t("admin.rsvp.approve")}: ${c.name}`}
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
        <section className="card" aria-labelledby="rsvp-per-part">
          <b id="rsvp-per-part">{t("admin.rsvp.perPart")}</b>
          {data.parts.length === 0 && <span className="hint">{t("admin.rsvp.noParts")}</span>}
          {data.totals.map((total) => (
            <div key={total.partId} className="bar-row">
              <span>{partName(total.partId)}</span>
              <div className="track" aria-hidden="true">
                <i style={{ width: `${String((total.yes / widest) * 100)}%` }} />
                <i className="no" style={{ width: `${String((total.no / widest) * 100)}%` }} />
              </div>
              <span className="sm">{t("admin.rsvp.yesNo", { yes: total.yes, no: total.no })}</span>
            </div>
          ))}
        </section>
        <section className="card" aria-labelledby="rsvp-menus">
          <b id="rsvp-menus">
            {meal ? t("admin.rsvp.menus", { part: meal.name }) : t("admin.rsvp.menusNoMeal")}
          </b>
          {!meal && <span className="hint">{t("admin.rsvp.noMealPart")}</span>}
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
        <div className="row">
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
                <th>{t("admin.rsvp.status")}</th>
                <th>{t("admin.rsvp.parts")}</th>
                <th>{t("admin.rsvp.menu")}</th>
                {data.songEnabled && <th>{t("admin.rsvp.song")}</th>}
                <th>🔒 {t("admin.rsvp.allergies")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={data.songEnabled ? 6 : 5}>{t("admin.rsvp.noGuests")}</td>
                </tr>
              )}
              {shown.map((guest) => (
                <Fragment key={guest.userId}>
                  <tr>
                    <td>
                      <b>{guest.name}</b>
                      <br />
                      <Link
                        className="btn soft sm"
                        to={`/admin/rsvp/guests/${String(guest.userId)}`}
                        aria-label={`${t("admin.rsvp.edit")}: ${guest.name}`}
                      >
                        {t("admin.rsvp.edit")}
                      </Link>
                    </td>
                    <td>
                      <span className={STATUS_TAG[guest.status]}>
                        {t(`admin.rsvp.statuses.${guest.status}`)}
                      </span>
                    </td>
                    <td>
                      {guest.attendingPartIds.map(partName).join(", ") || t("admin.rsvp.none")}
                    </td>
                    <td>
                      {meal && guest.attendingPartIds.includes(meal.id)
                        ? menuName(guest.menuId)
                        : t("admin.rsvp.none")}
                    </td>
                    {data.songEnabled && <td>{guest.songWish ?? t("admin.rsvp.none")}</td>}
                    <td>{guest.allergies ?? t("admin.rsvp.none")}</td>
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
                        <td>
                          <span className="tag ok">{t("admin.rsvp.companionStatus.approved")}</span>
                        </td>
                        <td>
                          {c.attendingPartIds.map(partName).join(", ") || t("admin.rsvp.none")}
                        </td>
                        <td>
                          {meal && c.attendingPartIds.includes(meal.id)
                            ? menuName(c.menuId)
                            : t("admin.rsvp.none")}
                        </td>
                        {data.songEnabled && <td>{t("admin.rsvp.none")}</td>}
                        <td>{c.allergies ?? t("admin.rsvp.none")}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <span className="hint">{t("admin.rsvp.hint")}</span>
      </section>
    </>
  );
}
