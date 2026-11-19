// The card "Wo sitze ich?" on the start page (UX mock `home`, event day): the guest's table and some of their
// tablemates, leading to the table finder. Nothing is shown while the plan is hidden or the guest has no table.
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { seatingGuestResponseSchema } from "@zappaloo/shared";
import { useApiData } from "../app/useApi.ts";
import { useTableName } from "./seating.ts";

export default function SeatCard() {
  const { t } = useTranslation();
  const tableName = useTableName();
  const seating = useApiData("/api/seating", seatingGuestResponseSchema);
  const table = seating?.visible === true ? seating.tables[0] : undefined;
  if (table === undefined) return null;
  const names = table.mates.slice(0, 2).map((mate) => mate.name.split(" ")[0] ?? mate.name);
  const more = table.mates.length - names.length;
  return (
    <Link className="card seat-home" to="/seating" data-testid="seat-card">
      <span className="eyebrow">{t("seating.title")}</span>
      <b className="h2">{tableName(table.name)}</b>
      {names.length > 0 && (
        <span className="muted sm">
          {more > 0
            ? t("seating.withMore", { names: names.join(", "), count: more })
            : t("seating.with", { names: names.join(", ") })}
        </span>
      )}
    </Link>
  );
}
