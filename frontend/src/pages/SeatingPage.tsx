// "Wo sitze ich?" (sw-architecture.md 3.6; PRES-06, PRES-07, PRES-12; UX mocks `seating`, `game-table`): the guest's
// table and their tablemates with photo, greeting and "How I know the couple", no seat. Before the date the admin set
// the page says so with that date. It is also the page that clickable objects of the game open (`seating`).
import { useTranslation } from "react-i18next";
import { seatingGuestResponseSchema } from "@zappaloo/shared";
import type { SeatingGuestTable, SeatingMate } from "@zappaloo/shared";
import { useApiData } from "../app/useApi.ts";
import { useEventFormat } from "../rsvp/format.ts";
import { useTableName } from "./seating.ts";

/** The first letters of a name, for the round picture without a photo. */
function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("");
  return letters === "" ? "?" : letters.toLocaleUpperCase();
}

function Mate({ mate }: { mate: SeatingMate }) {
  const { t } = useTranslation();
  const badge =
    mate.badge ??
    (mate.companionOf === null ? null : t("seating.companionOf", { name: mate.companionOf }));
  return (
    <li className="li" data-testid="tablemate">
      {mate.photo === null ? (
        <span className="bubble-pic" aria-hidden="true">
          {initials(mate.name)}
        </span>
      ) : (
        <img
          className="bubble-pic"
          src={`/api/seating/photo/${mate.key}?v=${String(mate.photo)}`}
          alt=""
        />
      )}
      <div className="grow">
        <b>{mate.name}</b>
        {mate.greeting !== null && <span className="sm">{mate.greeting}</span>}
        {mate.line !== null && <span className="hint">{mate.line}</span>}
      </div>
      {badge !== null && <span className="tag">{badge}</span>}
    </li>
  );
}

function TableCard({ table, mine }: { table: SeatingGuestTable; mine: boolean }) {
  const { t } = useTranslation();
  const tableName = useTableName();
  return (
    <>
      <div className="card strong seat-card">
        <span className="eyebrow">
          {mine ? t("seating.yourTable") : t("seating.tableFor", { names: table.party.join(", ") })}
        </span>
        <h2 className="h1">{tableName(table.name)}</h2>
        <span className="hint">{t("seating.places", { count: table.places })}</span>
      </div>
      <b>{mine ? t("seating.atYourTable") : t("seating.atThisTable")}</b>
      {table.mates.length === 0 ? (
        <p className="hint">{t("seating.alone")}</p>
      ) : (
        <div className="card">
          <ul className="list">
            {table.mates.map((mate) => (
              <Mate key={mate.key} mate={mate} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function SeatingPage() {
  const { t } = useTranslation();
  const format = useEventFormat();
  const seating = useApiData("/api/seating", seatingGuestResponseSchema);
  if (!seating) return null;
  return (
    <section className="seating stack">
      <h1 className="h1">{t("seating.title")}</h1>
      {!seating.visible ? (
        <div className="card seat-card" data-testid="seating-hidden">
          <b className="h2">{t("seating.secretTitle")}</b>
          <p className="muted">
            {seating.visibleFrom === null
              ? t("seating.secretNoDate")
              : t("seating.secretDate", {
                  date: `${format.date(seating.visibleFrom)} ${format.time(seating.visibleFrom)}`,
                })}
          </p>
        </div>
      ) : seating.tables.length === 0 ? (
        <div className="card seat-card" data-testid="seating-none">
          <b className="h2">{t("seating.noneTitle")}</b>
          <p className="muted">{t("seating.noneText")}</p>
        </div>
      ) : (
        seating.tables.map((table, index) => (
          <TableCard key={table.name} table={table} mine={index === 0} />
        ))
      )}
    </section>
  );
}
