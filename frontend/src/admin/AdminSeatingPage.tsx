// Sitzplan (sw-architecture.md 3.6; PRES-05 – PRES-07; UX mock `admin-seating`, decision 32): the persons who attend
// are placed on the tables of the world by drag and drop, or by tapping a person and then a table (touch screens);
// a companion follows the guest's table until they are placed elsewhere. The date from which guests see the plan is
// set here. The tables are the seat objects of the world, each with as many places as seats.
import { useState } from "react";
import type { DragEvent, SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { adminSeatingResponseSchema, instantToLocal, localToInstant } from "@zappaloo/shared";
import type { SeatingPerson } from "@zappaloo/shared";
import { useEvent } from "../app/event.ts";
import { fieldText } from "../app/forms.ts";
import { DateTimeField } from "./DateTimeField.tsx";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const SEATING_PATH = "/api/admin/seating";
const VISIBLE_FROM = "visibleFrom";

export default function AdminSeatingPage() {
  const { t } = useTranslation();
  const event = useEvent();
  const timeZone = event?.timezone ?? "UTC";
  const call = useAdminCall();
  const errorText = useErrorText({ table_full: t("admin.seating.tableFull") });
  const { data, reload } = useAdminData(SEATING_PATH, adminSeatingResponseSchema);
  /** The person tapped to be placed next (touch screens); a drag carries the key itself. */
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function place(key: string, table: string | null) {
    const result = await call("PUT", `${SEATING_PATH}/assignments/${key}`, { table });
    setSelected(undefined);
    if (result.ok) {
      setError(undefined);
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  async function saveVisibility(form: SubmitEvent<HTMLFormElement>) {
    form.preventDefault();
    const local = fieldText(new FormData(form.currentTarget), VISIBLE_FROM);
    const result = await call("PUT", `${SEATING_PATH}/visibility`, {
      visibleFrom: local === "" ? null : localToInstant(local, timeZone).toISOString(),
    });
    if (result.ok) {
      setError(undefined);
      setSaved(true);
      reload();
    } else {
      setError(errorText(result.errorCode));
      setSaved(false);
    }
  }

  if (!data) return null;

  const person = (item: SeatingPerson) => (
    <button
      key={item.key}
      type="button"
      className="chip"
      aria-pressed={selected === item.key}
      draggable
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData("text/plain", item.key);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => {
        setSelected(selected === item.key ? undefined : item.key);
      }}
    >
      {item.name}
      {item.companionOf !== null && (
        <span aria-label={t("admin.seating.companionOf", { name: item.companionOf })}>
          {t("admin.seating.companionSign")}
        </span>
      )}
    </button>
  );

  /** A place that takes a dragged person or the one that was tapped. */
  const target = (table: string | null) => ({
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const key = event.dataTransfer.getData("text/plain");
      if (key !== "") void place(key, table);
    },
  });

  return (
    <section className="stack">
      <h1 className="h1">{t("admin.seating.title")}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form className="card flat stack" onSubmit={(form) => void saveVisibility(form)}>
        <DateTimeField
          name={VISIBLE_FROM}
          label={t("admin.seating.visibleFrom")}
          hint={t("admin.seating.visibleFromHint")}
          key={data.visibleFrom ?? "none"}
          defaultValue={data.visibleFrom ? instantToLocal(data.visibleFrom, timeZone) : undefined}
        />
        <div className="row">
          <button type="submit" className="btn soft sm">
            {t("admin.seating.saveVisibility")}
          </button>
          {saved && (
            <span role="status" className="hint">
              {t("admin.seating.saved")}
            </span>
          )}
        </div>
      </form>
      <section className="card" aria-labelledby="seating-unassigned" {...target(null)}>
        <b id="seating-unassigned">
          {t("admin.seating.unassigned", { count: data.unassigned.length })}
        </b>
        <div className="chips" data-testid="seating-unassigned">
          {data.unassigned.map(person)}
        </div>
        <span className="hint">{t("admin.seating.unassignedHint")}</span>
        {selected !== undefined && !data.unassigned.some((item) => item.key === selected) && (
          <button type="button" className="btn ghost sm" onClick={() => void place(selected, null)}>
            {t("admin.seating.takeAway")}
          </button>
        )}
      </section>
      {data.tables.length === 0 ? (
        <p className="hint">{t("admin.seating.noTables")}</p>
      ) : (
        <div className="grid-3">
          {data.tables.map((table) => (
            <section
              key={table.name}
              className="card"
              aria-label={t("admin.seating.tableLabel", { name: table.name })}
              data-testid={`table-${table.name}`}
              {...target(table.name)}
            >
              <div className="row">
                <b className="grow">{table.name}</b>
                <span
                  className={table.persons.length >= table.places ? "tag warn" : "hint"}
                  aria-label={t("admin.seating.places", {
                    taken: table.persons.length,
                    count: table.places,
                  })}
                >
                  {table.persons.length} / {table.places}
                </span>
              </div>
              <span className="hint">{table.mapName ?? table.map}</span>
              <div className="chips">{table.persons.map(person)}</div>
              {selected !== undefined && !table.persons.some((item) => item.key === selected) && (
                <button
                  type="button"
                  className="btn soft sm"
                  onClick={() => void place(selected, table.name)}
                >
                  {t("admin.seating.placeHere")}
                </button>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
