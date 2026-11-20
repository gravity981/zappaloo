// The typing of a dialogue line (CNT-10).

/** Characters per second. */
export const TYPE_CHARACTERS_PER_SECOND = 40;

/** Whether the guest asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
