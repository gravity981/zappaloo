// What the game shows about a walk that a click or tap started (GAME-24, GAME-25): the marker on the ground at the
// target, and the glow of the object or portal the walk leads to. Which of them show, and when they go, is decided
// here, from the events of the scene, so that tests can check it without Phaser.
import type { Point } from "./geometry.ts";

/**
 * The colour of the glow of clickable objects, of the marker's ring and of the pulse of a walk to a portal: the colour
 * of the sparkles (GAME-15), so that everything that invites a tap looks alike.
 */
export const GLOW_COLOR = 0xfff3a0;

export interface WalkFeedback {
  /** The target of the walk, where the marker lies. */
  marker: Point | undefined;
  /** The Tiled id of the object or portal that the walk leads to, which glows. */
  glow: number | undefined;
}

export const NO_FEEDBACK: WalkFeedback = { marker: undefined, glow: undefined };

export type FeedbackEvent =
  /** A click or tap started a walk to `target`, to the object or portal with the id `glow` when there is one. */
  | { type: "walk"; target: Point; glow?: number }
  /** A tap that did not start a walk: it ends the walk to an object (its action no longer runs), not the walk itself. */
  | { type: "tap" }
  /** Every frame: how many waypoints are left, and whether the arrow keys are held. */
  | { type: "frame"; waypoints: number; keysHeld: boolean }
  /** The walk was stopped: it was blocked or stuck, or an activation key ran the action. */
  | { type: "stopped" };

/** The feedback after an event. The marker and the glow end with the walk: on arrival, on stop and on the keys. */
export function nextFeedback(state: WalkFeedback, event: FeedbackEvent): WalkFeedback {
  switch (event.type) {
    case "walk":
      return { marker: event.target, glow: event.glow };
    case "tap":
      return state.glow === undefined ? state : { marker: state.marker, glow: undefined };
    case "frame":
      return event.keysHeld || event.waypoints === 0 ? NO_FEEDBACK : state;
    case "stopped":
      return NO_FEEDBACK;
  }
}

/** The strength of the glow along the edges of a clickable object that is not a portal's arrow. */
export const IDLE_GLOW_STRENGTH = 2;
/** The strongest the glow gets while the avatar walks to the object. */
export const PULSE_GLOW_STRENGTH = 7;
/** The time of one pulse of the glow and of the marker, in milliseconds (GAME-24, GAME-25). */
export const PULSE_MS = 1000;

/**
 * The strength of an object's glow: a steady glow while it only invites a tap (GAME-29), and one that swells and fades
 * once per second while the avatar walks to it (GAME-25). `elapsedMs` counts from the start of the walk.
 */
export function objectGlowStrength(pulsing: boolean, elapsedMs: number): number {
  if (!pulsing) return IDLE_GLOW_STRENGTH;
  const phase = (elapsedMs % PULSE_MS) / PULSE_MS;
  return (
    IDLE_GLOW_STRENGTH + (PULSE_GLOW_STRENGTH - IDLE_GLOW_STRENGTH) * Math.sin(phase * Math.PI)
  );
}
