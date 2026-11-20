// The floating arrow of a portal (GAME-15): how it hovers above the ground and how far it bobs. The scene animates it
// with these numbers, and the label of the portal (GAME-41) clears its highest point with them, so the two cannot drift.

/** How far the arrow hovers above its picture's place on the map, in map pixels. */
export const PORTAL_ARROW_HOVER = 6;
/** How far the arrow rises and sinks while it bobs, in map pixels. */
export const PORTAL_ARROW_BOB = 4;
/** How far the highest point of the arrow's bob lies above the top of its picture, in map pixels (decision 7, epic 6.1). */
export const PORTAL_ARROW_RISE = PORTAL_ARROW_HOVER + PORTAL_ARROW_BOB;
