// A password field with an eye button that shows what was typed, so a typo is visible (the
// registration form has no repeated password, UX decision of 2026-11-11).
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

export default function PasswordField({
  label,
  hint,
  placeholder,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const hintId = useId();
  return (
    <div className="field">
      <label htmlFor={`${hintId}-input`}>
        <span>{label}</span>
      </label>
      <div className="password-row">
        <input
          id={`${hintId}-input`}
          className="input"
          name="password"
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          required
          {...(placeholder ? { placeholder } : {})}
          {...(hint ? { "aria-describedby": hintId } : {})}
        />
        <button
          type="button"
          className="btn ghost sm"
          aria-pressed={shown}
          onClick={() => {
            setShown(!shown);
          }}
        >
          {shown ? t("guest.hidePassword") : t("guest.showPassword")}
        </button>
      </div>
      {hint && (
        <small id={hintId} className="hint">
          {hint}
        </small>
      )}
    </div>
  );
}
