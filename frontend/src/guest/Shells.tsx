// The two page frames of the guest pages, from the UX mocks: `bare` (brand header and one
// narrow column: login, invitation, forgot password, privacy) and `flow` (close button, title,
// step counter with progress bar, sticky action bar: the RSVP).
import "../app/ui.css";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import VersionFooter from "../app/VersionFooter.tsx";
import { useSiteName } from "./site.ts";

/** The brand: the event's name, or the app's name until it is known. */
export function Brand() {
  const { t } = useTranslation();
  const name = useSiteName();
  return (
    <Link className="guest-bare-brand" to="/">
      <b>{name ?? t("app.name")}</b>
    </Link>
  );
}

export function BareShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="guest guest-bare">
      <Brand />
      <main className={wide ? "guest-bare-inner wide" : "guest-bare-inner"}>{children}</main>
      <VersionFooter />
    </div>
  );
}

export function FlowShell({
  title,
  step,
  total,
  closeTo,
  closeLabel,
  footer,
  children,
}: {
  title: string;
  /** The current step and the number of steps; without them there is no progress bar. */
  step?: number;
  total?: number;
  closeTo: string;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const progress = step !== undefined && total !== undefined;
  return (
    <div className="guest guest-flow">
      <header className="guest-flow-head">
        <div className="guest-flow-top">
          <Link className="iconbtn" to={closeTo} aria-label={closeLabel}>
            ×
          </Link>
          <b>{title}</b>
          <span className="count">{progress ? `${String(step)}/${String(total)}` : ""}</span>
        </div>
        {progress ? (
          <div className="guest-flow-progress" aria-hidden="true">
            {Array.from({ length: total }, (_, index) => (
              <i key={index} className={index < step ? "on" : ""} />
            ))}
          </div>
        ) : (
          <div style={{ height: 2 }} />
        )}
      </header>
      <main className="guest-flow-body">
        {children}
        <VersionFooter />
      </main>
      {footer && (
        <footer className="guest-flow-foot">
          <div className="guest-flow-foot-in">{footer}</div>
        </footer>
      )}
    </div>
  );
}
