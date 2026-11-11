// Time arithmetic of the waiting page.

/** Days, hours, minutes and seconds left until `target` (milliseconds); null once it has passed. */
export function timeLeft(target: number, now: number) {
  const total = Math.floor((target - now) / 1000);
  if (total <= 0) return null;
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
