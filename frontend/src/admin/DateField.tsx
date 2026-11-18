// One field for a date without a time, written day.month.year: `15.05.2027`. The native `date`
// input follows the browser's locale (month first in some of them), so the field is a text input
// with its own format, like the date and time field. The form gets one value, `YYYY-MM-DD`, or ""
// while the field is empty or does not hold a valid date (the browser then refuses to submit).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** `YYYY-MM-DD` as `DD.MM.YYYY`; "" for nothing. */
function toDisplay(date: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day ?? ""}.${month ?? ""}.${year ?? ""}`;
}

/** `DD.MM.YYYY` as `YYYY-MM-DD`; null if it is not a real date. */
function fromDisplay(text: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = match.slice(1).map(Number) as [number, number, number];
  const check = new Date(Date.UTC(year, month - 1, day));
  const real =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day;
  if (!real) return null;
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function DateField({
  name,
  label,
  hint,
  defaultValue,
  required,
}: {
  /** The name of the form field that carries `YYYY-MM-DD`. */
  name: string;
  label: string;
  hint?: string;
  /** `YYYY-MM-DD`, or nothing. */
  defaultValue?: string;
  required?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(toDisplay(defaultValue));
  const date = fromDisplay(text);
  const input = useRef<HTMLInputElement>(null);
  const invalid = t("admin.date.invalid");
  useEffect(() => {
    // An empty optional field is fine; anything else must be a real date.
    input.current?.setCustomValidity(text.trim() === "" || date !== null ? "" : invalid);
  }, [text, date, invalid]);
  return (
    <>
      {/* Outside the label, so that the label names the visible input only. */}
      <input type="hidden" name={name} value={date ?? ""} />
      <label className="field">
        <span>{label}</span>
        <input
          ref={input}
          className="input auto"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          placeholder={t("admin.date.placeholder")}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        {hint && <span className="hint">{hint}</span>}
      </label>
    </>
  );
}
