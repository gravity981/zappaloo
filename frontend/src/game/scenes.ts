// Phaser scenes. For now only an empty scene that proves Phaser is mounted;
// the game world follows in stage 5.
import Phaser from "phaser";

export const EMPTY_SCENE_KEY = "empty";

export class EmptyScene extends Phaser.Scene {
  constructor() {
    super(EMPTY_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#2d6a4f");
  }
}
