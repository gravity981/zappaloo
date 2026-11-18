// Einstellungen › Gästeprofile (PRES-15; UX mock `admin-settings`): the options of "Wie kennst du das Paar?" that
// guests choose in their profile and that appear as a badge in the speech bubble. The list keeps at least one
// option; an option keeps its choices while it is renamed or moved, and a removed one clears them.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PROFILE_LIMITS, relationsResponseSchema } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const PATH = "/api/admin/profile/relations";

interface Row {
  id?: number;
  name: string;
}

export default function RelationsCard() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const { data, reload } = useAdminData(PATH, relationsResponseSchema);
  /** The list being edited; undefined while it is as stored. */
  const [draft, setDraft] = useState<Row[]>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  if (!data) return null;
  const rows: Row[] = draft ?? data.relations;
  const edit = (next: Row[]) => {
    setDraft(next);
    setSaved(false);
  };
  const valid = rows.length > 0 && rows.every((row) => row.name.trim() !== "");

  async function save() {
    const result = await call("PUT", PATH, {
      relations: rows.map((row) => ({
        ...(row.id === undefined ? {} : { id: row.id }),
        name: row.name.trim(),
      })),
    });
    if (result.ok) {
      setError(undefined);
      setSaved(true);
      setDraft(undefined);
      reload();
    } else {
      setError(errorText(result.errorCode));
      setSaved(false);
    }
  }

  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    if (row !== undefined) next.splice(index + by, 0, row);
    edit(next);
  };

  return (
    <section className="card" aria-labelledby="relations-title">
      <b id="relations-title">{t("admin.relations.title")}</b>
      <span className="hint">{t("admin.relations.hint")}</span>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="stack relations-list">
        {rows.map((row, index) => (
          <li key={row.id ?? `new-${String(index)}`} className="row">
            <input
              className="input"
              aria-label={t("admin.relations.option", { n: index + 1 })}
              value={row.name}
              maxLength={PROFILE_LIMITS.relationName}
              onChange={(event) => {
                edit(
                  rows.map((item, at) =>
                    at === index ? { ...item, name: event.target.value } : item,
                  ),
                );
              }}
            />
            <button
              type="button"
              className="btn ghost sm"
              aria-label={t("admin.relations.up", { name: row.name })}
              disabled={index === 0}
              onClick={() => {
                move(index, -1);
              }}
            >
              {t("admin.relations.upSign")}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              aria-label={t("admin.relations.down", { name: row.name })}
              disabled={index === rows.length - 1}
              onClick={() => {
                move(index, 1);
              }}
            >
              {t("admin.relations.downSign")}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              aria-label={t("admin.relations.remove", { name: row.name })}
              disabled={rows.length === 1}
              onClick={() => {
                edit(rows.filter((_, at) => at !== index));
              }}
            >
              {t("admin.relations.removeSign")}
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          type="button"
          className="btn ghost sm"
          disabled={rows.length >= PROFILE_LIMITS.relations}
          onClick={() => {
            edit([...rows, { name: "" }]);
          }}
        >
          {t("admin.relations.add")}
        </button>
        <button
          type="button"
          className="btn soft sm"
          disabled={draft === undefined || !valid}
          onClick={() => void save()}
        >
          {t("admin.relations.save")}
        </button>
        {saved && (
          <span role="status" className="hint">
            {t("admin.relations.saved")}
          </span>
        )}
      </div>
    </section>
  );
}
