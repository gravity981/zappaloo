// The keyboard of the game (GAME-09): the game uses the arrow keys, W A S D, Enter and Space only where
// the page does not need them. A field, a button or a link keeps its keys.

/** The elements that take typed text, a choice or a press of their own. */
const TYPING_TARGETS = "input, textarea, select, button, a[href], [contenteditable]";

/** Whether the element takes keys of its own, so the game must leave them alone. */
export function isTypingTarget(element: Element | null): boolean {
  return element?.matches(TYPING_TARGETS) === true;
}
