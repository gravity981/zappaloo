// Building blocks of the admin area (sw-architecture.md 8.3), after the admin mocks.
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** An on/off switch; `label` names what it switches. */
export function Switch({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
    />
  );
}

/** A chip that is on or off (roles, capabilities, groups). */
export function ToggleChip({
  pressed,
  onToggle,
  children,
  small = false,
  disabled = false,
  label,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  small?: boolean;
  disabled?: boolean;
  /** Accessible name, if the visible text alone is ambiguous (several rows). */
  label?: string;
}) {
  return (
    <button
      type="button"
      className={small ? "chip small" : "chip"}
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}

/**
 * A panel over the page: a side sheet on desktop, full screen on phones. Escape and the close
 * button close it; the heading gets the focus, so screen readers start there.
 */
export function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      className="panel-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="panel-head">
          <h2 className="h2" id={titleId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="iconbtn" aria-label={t("admin.close")} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </div>
  );
}

/**
 * A one-time link (setup or reset) for the admin to hand over: shown once, with a copy button
 * and its expiry (sw-architecture.md 8.3).
 */
export function HandOverLink({
  url,
  expiresAt,
  label,
}: {
  url: string;
  expiresAt: string;
  label: string;
}) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  return (
    <div className="card flat">
      <label className="field" htmlFor={inputId}>
        <span>{label}</span>
      </label>
      <div className="handover">
        <input
          id={inputId}
          className="input"
          readOnly
          value={url}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            try {
              void navigator.clipboard
                .writeText(url)
                .then(() => {
                  setCopied(true);
                })
                .catch(() => undefined);
            } catch {
              // No clipboard (plain http): the field selects the link for copying by hand.
            }
          }}
        >
          {copied ? t("admin.copied") : t("admin.copy")}
        </button>
      </div>
      <p className="hint">
        {t("admin.linkHint", { date: new Date(expiresAt).toLocaleString(i18n.language) })}
      </p>
    </div>
  );
}
