// The countdown to the announced opening date (ACS-13). It disappears when it reaches zero,
// even if the platform is still closed; the text of the page stays.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { timeLeft } from "./time.ts";

export default function Countdown({ to }: { to: string }) {
  const { t } = useTranslation();
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const left = timeLeft(target, now);
  if (!left) return null;
  const units = [
    ["days", left.days],
    ["hours", left.hours],
    ["minutes", left.minutes],
    ["seconds", left.seconds],
  ] as const;
  return (
    <div className="countdown" role="timer" aria-label={t("waiting.countdown")}>
      {units.map(([unit, value]) => (
        <div key={unit}>
          <b>{String(value).padStart(2, "0")}</b>
          <small>{t(`waiting.units.${unit}`)}</small>
        </div>
      ))}
    </div>
  );
}
