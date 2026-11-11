// Small pictures of the install page (UX mock `install`): the app's tile and the two icons the
// iOS steps point at. They are decoration; the steps say the same in words.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="i inline-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Safari's Share icon. */
export function ShareIcon() {
  return (
    <Svg>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M7 11H6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />
    </Svg>
  );
}

/** "Add to home screen": a plus in a square. */
export function AddIcon() {
  return (
    <Svg>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

/** The home screen icon with the event's name beside it. */
export function InstallTile({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <div className="install-tile">
      <img src="/app-icons/icon-192.png" alt="" width="56" height="56" />
      <div>
        <b>{name}</b>
        <span className="hint">{t("install.tileHint")}</span>
      </div>
    </div>
  );
}
