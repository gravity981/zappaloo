// The atmosphere of a map as the scene draws it (GAME-31 – GAME-34): the fog along the border, the cloud shadows that
// drift over the map and the birds that fly through the view. The rules and the movement are in fog.ts, clouds.ts,
// birds.ts and atmosphere-plan.ts; this makes the pictures and puts them in place. The depth order from below: the
// ground, the objects and figures, the cloud shadows over them, the fog over everything, the birds above it all.
import Phaser from "phaser";
import { type AtmospherePlan } from "./atmosphere-plan.ts";
import { BIRD_FRAMES_PER_SECOND, FlockSchedule, birdPosition } from "./birds.ts";
import { CLOUD_OPACITY, CloudField } from "./clouds.ts";
import { FOG_CELL, FOG_COLOUR, fogRaster } from "./fog.ts";
import { mapBounds } from "./geometry.ts";
import type { ParsedMap } from "./map-model.ts";
import type { LoadedWorld } from "./world-data.ts";

/** Above the objects, the figures and their name tags, below the editor guides (2 000 000). */
export const CLOUD_DEPTH = 1_700_000;
export const FOG_DEPTH = 1_800_000;
export const BIRD_DEPTH = 1_900_000;

/** The pictures of the shadows: a few, so that the shadows are not all alike. */
const CLOUD_SHAPES = 3;
const CLOUD_TEXTURE = { width: 256, height: 128 } as const;
/** The longest step of one frame, so that a stalled tab does not make the effects jump. */
const MAX_DELTA_MS = 100;

/** What the test hook shows of the atmosphere of the map. */
export interface AtmosphereState {
  fog: boolean;
  /** How many cloud shadows are over the map, and how many birds are in the view now. */
  clouds: number;
  birds: number;
}

/** A pseudo-random number from a seed, so that the pictures of the shadows are the same on every device. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** One shadow picture: soft dark blobs of a loose 2 : 1 cloud, fading out to nothing at every edge. */
function cloudCanvas(shape: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CLOUD_TEXTURE.width;
  canvas.height = CLOUD_TEXTURE.height;
  const context = canvas.getContext("2d");
  if (context === null) return canvas;
  const random = seeded(shape * 7919 + 17);
  const blobs = 6 + shape;
  for (let index = 0; index < blobs; index++) {
    // Blobs gather in the middle: a cloud, not a ring.
    const x = CLOUD_TEXTURE.width * (0.26 + 0.48 * random());
    const y = CLOUD_TEXTURE.height * (0.3 + 0.4 * random());
    const radius = CLOUD_TEXTURE.height * (0.28 + 0.2 * random());
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(20, 28, 48, 0.85)");
    gradient.addColorStop(0.55, "rgba(20, 28, 48, 0.35)");
    gradient.addColorStop(1, "rgba(20, 28, 48, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, CLOUD_TEXTURE.width, CLOUD_TEXTURE.height);
  }
  return canvas;
}

export class Atmosphere {
  readonly #scene: Phaser.Scene;
  readonly #world: LoadedWorld;
  readonly #ratio: () => number;
  readonly #fog: Phaser.GameObjects.Image | undefined;
  readonly #field: CloudField | undefined;
  readonly #cloudSprites: Phaser.GameObjects.Image[] = [];
  readonly #schedule: FlockSchedule | undefined;
  readonly #birdSprites: Phaser.GameObjects.Sprite[] = [];
  #clock = 0;

  constructor(
    scene: Phaser.Scene,
    map: ParsedMap,
    world: LoadedWorld,
    plan: AtmospherePlan,
    ratio: () => number,
  ) {
    this.#scene = scene;
    this.#world = world;
    this.#ratio = ratio;
    const bounds = mapBounds(map.columns, map.rows, map.size);
    if (plan.fog) this.#fog = this.#makeFog(map, bounds);
    if (plan.clouds) {
      this.#field = new CloudField(bounds, CLOUD_SHAPES);
      for (const cloud of this.#field.clouds) this.#cloudSprites.push(this.#makeCloud(cloud.shape));
      this.#placeClouds();
    }
    if (plan.birds && world.bird !== undefined) this.#schedule = new FlockSchedule();
  }

  /** The fog: the raster of the opacity as a smoothed picture over the map and the fade around it. */
  #makeFog(map: ParsedMap, bounds: ReturnType<typeof mapBounds>): Phaser.GameObjects.Image {
    const raster = fogRaster(bounds, map.obstacles.borders, map.size.width);
    const key = `atmosphere:fog:${this.#world.version}:${map.id}`;
    if (!this.#scene.textures.exists(key)) {
      const canvas = document.createElement("canvas");
      canvas.width = raster.columns;
      canvas.height = raster.rows;
      const context = canvas.getContext("2d");
      if (context !== null) {
        const data = context.createImageData(raster.columns, raster.rows);
        for (let index = 0; index < raster.alpha.length; index++) {
          data.data[index * 4] = FOG_COLOUR.r;
          data.data[index * 4 + 1] = FOG_COLOUR.g;
          data.data[index * 4 + 2] = FOG_COLOUR.b;
          data.data[index * 4 + 3] = raster.alpha[index] ?? 0;
        }
        context.putImageData(data, 0, 0);
      }
      this.#scene.textures.addCanvas(key, canvas);
      // The game draws pixel art without smoothing; the fog is a soft picture of a coarse raster.
      this.#scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    return this.#scene.add
      .image(raster.area.x, raster.area.y, key)
      .setOrigin(0, 0)
      .setDisplaySize(raster.columns * FOG_CELL, raster.rows * FOG_CELL)
      .setDepth(FOG_DEPTH);
  }

  #makeCloud(shape: number): Phaser.GameObjects.Image {
    const key = `atmosphere:cloud:${String(shape)}`;
    if (!this.#scene.textures.exists(key)) {
      this.#scene.textures.addCanvas(key, cloudCanvas(shape));
      this.#scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    return this.#scene.add.image(0, 0, key).setAlpha(CLOUD_OPACITY).setDepth(CLOUD_DEPTH);
  }

  #placeClouds(): void {
    const field = this.#field;
    if (field === undefined) return;
    field.clouds.forEach((cloud, index) => {
      let sprite = this.#cloudSprites[index];
      // A shadow that was replaced may have another picture.
      const key = `atmosphere:cloud:${String(cloud.shape)}`;
      if (sprite !== undefined && sprite.texture.key !== key) {
        sprite.destroy();
        sprite = this.#makeCloud(cloud.shape);
        this.#cloudSprites[index] = sprite;
      }
      sprite?.setPosition(cloud.x, cloud.y).setDisplaySize(cloud.width, cloud.height);
    });
  }

  /** What the test hook shows: whether there is fog, how many shadows and how many birds are there now. */
  get state(): AtmosphereState {
    return {
      fog: this.#fog !== undefined,
      clouds: this.#cloudSprites.length,
      birds: this.#birdSprites.filter((sprite) => sprite.visible).length,
    };
  }

  update(delta: number): void {
    const dt = Math.min(delta, MAX_DELTA_MS);
    this.#clock += dt;
    if (this.#field !== undefined) {
      this.#field.update(dt);
      this.#placeClouds();
    }
    if (this.#schedule !== undefined) this.#flyBirds(dt);
  }

  /** The birds: their flight is worked out in the view (CSS pixels) and put where the camera sees it. */
  #flyBirds(delta: number): void {
    const bird = this.#world.bird;
    const schedule = this.#schedule;
    if (bird === undefined || schedule === undefined) return;
    const camera = this.#scene.cameras.main;
    const ratio = this.#ratio();
    const view = { width: camera.width / ratio, height: camera.height / ratio };
    const margin = (bird.size.width * (camera.zoom / ratio)) / 2 + 8;
    schedule.update(delta, view, margin);
    const flock = schedule.flock;
    if (flock === undefined) {
      for (const sprite of this.#birdSprites) sprite.setVisible(false);
      return;
    }
    while (this.#birdSprites.length < flock.birds.length) {
      const first = bird.flying.east[0] ?? bird.flying.west[0];
      if (first === undefined) return;
      this.#birdSprites.push(this.#scene.add.sprite(0, 0, first).setDepth(BIRD_DEPTH));
    }
    const frames = bird.flying[flock.direction];
    this.#birdSprites.forEach((sprite, index) => {
      const member = flock.birds[index];
      if (member === undefined || frames.length === 0) {
        sprite.setVisible(false);
        return;
      }
      const at = birdPosition(flock, member, view, margin);
      const world = camera.getWorldPoint(at.x * ratio, at.y * ratio);
      const time = this.#clock + (member.phase * 1000) / (BIRD_FRAMES_PER_SECOND * 4);
      const texture = frames[Math.floor((time / 1000) * BIRD_FRAMES_PER_SECOND) % frames.length];
      if (texture !== undefined && sprite.texture.key !== texture) sprite.setTexture(texture);
      sprite.setPosition(world.x, world.y).setVisible(true);
    });
  }

  destroy(): void {
    this.#fog?.destroy();
    for (const sprite of this.#cloudSprites) sprite.destroy();
    for (const sprite of this.#birdSprites) sprite.destroy();
    this.#cloudSprites.length = 0;
    this.#birdSprites.length = 0;
  }
}
