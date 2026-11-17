// The frames of a figure (sw-architecture.md 14.4): the standing pose of each direction, and the walk frames,
// which play in the order of the metadata at 8 frames per second.

/** The walk plays at 8 frames per second (14.4, the game side). */
export const WALK_FRAMES_PER_SECOND = 8;

/** The index of the walk frame at `time` milliseconds, for a walk of `count` frames. */
export function walkFrameIndex(time: number, count: number): number {
  if (count <= 0) return 0;
  return Math.floor((time / 1000) * WALK_FRAMES_PER_SECOND) % count;
}
