// Advancing the game by hand (test builds, spec/test-strategy.md 8.8). The game runs on the browser's clock, and a busy
// machine slows it down (Phaser caps the step of a frame), so a test that waits for a walk by the wall clock is flaky.
// A test that advances the game by frames gets the same game time on every machine.
import type Phaser from "phaser";

/** The step of one frame: 60 frames per second. */
export const FRAME_MS = 1000 / 60;

const played = new WeakSet<Phaser.Game>();

/** Whether a test plays this game by hand: its loop was stopped by `advanceGame` and must stay stopped. */
export function isPlayedByHand(game: Phaser.Game): boolean {
  return played.has(game);
}

/**
 * Advances the game by `ms` of game time in frames of `FRAME_MS`. The first call stops the game's own loop, which
 * does not run again: from then on only the frames asked for are played, so that nothing depends on the clock. The
 * frames in between are updated without drawing; the last one is drawn.
 */
export function advanceGame(game: Phaser.Game, ms: number): void {
  const loop = game.loop;
  played.add(game);
  if (loop.running) loop.sleep();
  const frames = Math.max(1, Math.round(ms / FRAME_MS));
  let time = loop.now;
  for (let frame = 0; frame < frames; frame++) {
    time += FRAME_MS;
    if (frame === frames - 1) game.step(time, FRAME_MS);
    else game.scene.update(time, FRAME_MS);
  }
  loop.now = time;
}
