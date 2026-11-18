// One field for a date and a time of day, written day.month.year and in 24-hour format:
// `12.06.2027 18:30`. The native `datetime-local` input follows the browser's locale (month first
// and AM/PM in some of them), so the field is a text input with its own format. The form gets one
// value, `YYYY-MM-DDTHH:mm` (what `localToInstant` reads), or "" while the field is empty or does
// not hold a valid date and time (the browser then refuses to submit).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** `YYYY-MM-DDTHH:mm` as `DD.MM.YYYY HH:mm`; "" for nothing. */
function toDisplay(local: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? "");
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  return `${day ?? ""}.${month ?? ""}.${year ?? ""} ${hour ?? ""}:${minute ?? ""}`;
}

/** `DD.MM.YYYY HH:mm` as `YYYY-MM-DDTHH:mm`; null if it is not a real date and time. */
function fromDisplay(text: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const real =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    hour < 24 &&
    minute < 60;
  if (!real) return null;
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function DateTimeField({
  name,
  label,
  hint,
  defaultValue,
  required,
}: {
  /** The name of the form field that carries `YYYY-MM-DDTHH:mm`. */
  name: string;
  label: string;
  hint?: string;
  /** `YYYY-MM-DDTHH:mm`, or nothing. */
  defaultValue?: string;
  required?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(toDisplay(defaultValue));
  const local = fromDisplay(text);
  const input = useRef<HTMLInputElement>(null);
  const invalid = t("admin.dateTime.invalid");
  useEffect(() => {
    // An empty optional field is fine; anything else must be a real date and time.
    input.current?.setCustomValidity(text.trim() === "" || local !== null ? "" : invalid);
  }, [text, local, invalid]);
  return (
    <>
      {/* Outside the label, so that the label names the visible input only. */}
      <input type="hidden" name={name} value={local ?? ""} />
      <label className="field">
        <span>{label}</span>
        <input
          ref={input}
          className="input auto"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          placeholder={t("admin.dateTime.placeholder")}
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
