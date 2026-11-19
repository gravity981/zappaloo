// The NPCs of one map as the scene draws them (GAME-36, GAME-38): a figure with the shadow of the player's figure,
// walking its path with the walk animation, or standing and waving now and then. NPCs are simulated on this device
// only and do not block the player. An NPC with an action is tappable: the crowd keeps a clickable area for it that
// follows the figure, which the scene's tap, Enter and arrival logic read like those of an object (14.2, 14.4).
import Phaser from "phaser";
import { figureDepth } from "./draw-order.ts";
import { SHADOW_DEPTH_BELOW, figureShadow } from "./figure-shadow.ts";
import { walkFrameIndex } from "./figures.ts";
import { GUEST_SPEED_FACTOR } from "./guest-crowd.ts";
import type { Point } from "./geometry.ts";
import { type ClickableArea, type NpcSpec, type ParsedMap } from "./map-model.ts";
import { directionOf, SPEED_TILES_PER_SECOND } from "./movement.ts";
import { NpcWalker, waveFrameIndex, waveLength } from "./npc-walk.ts";
import { playerSpritePosition } from "./player-anchor.ts";
import { actionOf } from "./interaction.ts";
import { waitDuration } from "./wander.ts";
import type { FigureData, LoadedWorld } from "./world-data.ts";

/** The longest step of one frame, so that a stalled tab does not make the NPCs jump across the map. */
const MAX_DELTA_MS = 100;

/** What the test hook shows of an NPC. */
export interface NpcState {
  name: string;
  figure: string;
  x: number;
  y: number;
  moving: boolean;
  waving: boolean;
  /** Whether a tap on it does anything. */
  tappable: boolean;
}

interface Member {
  spec: NpcSpec;
  figure: FigureData;
  walker: NpcWalker;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  /** The clickable area of an NPC with an action; it moves with the figure. */
  area: ClickableArea | undefined;
  /** Milliseconds of walking, which the walk animation runs on. */
  clock: number;
}

export class NpcCrowd {
  readonly #map: ParsedMap;
  readonly #zoom: number;
  readonly #ratio: () => number;
  readonly #members: Member[] = [];
  /** The NPC the player walks to, which waits for them. */
  #held: string | undefined;

  constructor(
    scene: Phaser.Scene,
    map: ParsedMap,
    world: LoadedWorld,
    zoom: number,
    ratio: () => number,
  ) {
    this.#map = map;
    this.#zoom = zoom;
    this.#ratio = ratio;
    for (const spec of map.npcs) {
      const figure = world.figures.find((item) => item.id === spec.figure);
      if (figure === undefined) continue;
      const walker = new NpcWalker(spec.position, {
        path: spec.path,
        initialWait: Math.random() * waitDuration(Math.random),
        waveDuration: waveLength(figure),
        random: Math.random,
      });
      const sprite = scene.add.sprite(0, 0, figure.standing.south).setOrigin(0.5, 1);
      const shadow = scene.add.ellipse(0, 0, 1, 1, 0x000000, 1);
      const area = this.#areaOf(spec, figure, walker, world);
      const member: Member = { spec, figure, walker, sprite, shadow, area, clock: 0 };
      this.#members.push(member);
      this.#place(member);
    }
  }

  /** The tappable NPCs, as clickable areas that follow the figures. */
  get areas(): ClickableArea[] {
    return this.#members.flatMap((member) => (member.area === undefined ? [] : [member.area]));
  }

  /** The drawn figure of a tappable NPC by the Tiled id of its object, for its glow. */
  spriteOf(objectId: number): Phaser.GameObjects.Sprite | undefined {
    return this.#members.find((member) => member.spec.objectId === objectId)?.sprite;
  }

  /** The NPCs on this map, for the test hook. */
  get states(): NpcState[] {
    return this.#members.map(({ spec, walker, area }) => ({
      name: spec.name,
      figure: spec.figure,
      x: Math.round(walker.position.x),
      y: Math.round(walker.position.y),
      moving: walker.moving,
      waving: walker.waveElapsed !== undefined,
      tappable: area !== undefined,
    }));
  }

  /** The NPC with this name waits instead of walking on (the player walks to it), or none does. */
  hold(name: string | undefined): void {
    this.#held = name;
  }

  /** One frame: the NPCs walk, stand or wave, and the sprites, shadows and tap areas follow them. */
  update(delta: number, player: Point): void {
    const map = this.#map;
    const dt = Math.min(delta, MAX_DELTA_MS);
    const step = (map.size.width * SPEED_TILES_PER_SECOND * GUEST_SPEED_FACTOR * dt) / 1000;
    for (const member of this.#members) {
      const { walker } = member;
      walker.held = this.#held === member.spec.name;
      if (walker.held) {
        walker.direction = directionOf({
          x: player.x - walker.position.x,
          y: player.y - walker.position.y,
        });
      }
      walker.update(dt, step);
      member.clock = walker.moving ? member.clock + dt : 0;
      this.#place(member);
    }
  }

  /** The area of an NPC with an action: its figure's body, and the point below it where the player stops. */
  #areaOf(
    spec: NpcSpec,
    figure: FigureData,
    walker: NpcWalker,
    world: LoadedWorld,
  ): ClickableArea | undefined {
    const area: ClickableArea = {
      name: spec.name,
      ...(spec.label === undefined ? {} : { label: spec.label }),
      hidden: true,
      objectId: spec.objectId,
      polygon: [],
      approach: walker.position,
      ...(spec.preset === undefined ? {} : { preset: spec.preset }),
    };
    this.#follow(area, figure, walker.position);
    // An NPC without an action is no object: a tap on it is a tap on the ground.
    return actionOf(world.actions, this.#map.id, area).kind === "none" ? undefined : area;
  }

  /** Puts an area where the figure stands: a box around its body, and the approach point half a tile below it. */
  #follow(area: ClickableArea, figure: FigureData, at: Point): void {
    const halfWidth = Math.max(figure.size.width / 3, 6);
    area.polygon = [
      { x: at.x - halfWidth, y: at.y - figure.size.height },
      { x: at.x + halfWidth, y: at.y - figure.size.height },
      { x: at.x + halfWidth, y: at.y },
      { x: at.x - halfWidth, y: at.y },
    ];
    area.approach = { x: at.x, y: at.y + this.#map.size.height / 2 };
  }

  /** Puts the sprite and shadow where the NPC stands, on the device-pixel grid like the player. */
  #place(member: Member): void {
    const map = this.#map;
    const { walker, figure, sprite, shadow, area } = member;
    const direction = walker.direction;
    let texture = figure.standing[direction];
    if (walker.waveElapsed !== undefined) {
      const frames = figure.wave?.[direction] ?? [];
      texture = frames[waveFrameIndex(walker.waveElapsed, frames.length)] ?? texture;
    } else if (walker.moving) {
      const frames = figure.walk[direction];
      texture = frames[walkFrameIndex(member.clock, frames.length)] ?? texture;
    }
    if (sprite.texture.key !== texture) sprite.setTexture(texture);
    const ratio = this.#ratio();
    const at = playerSpritePosition(walker.position, this.#zoom, ratio);
    sprite.setPosition(at.x, at.y);
    const depth = figureDepth(walker.position, map.occluders, map.size.width);
    sprite.setDepth(depth);
    const ground = figureShadow(walker.position, map.size.width, this.#zoom, ratio);
    shadow
      .setPosition(ground.x, ground.y)
      .setSize(ground.width, ground.height)
      .setFillStyle(0x000000, ground.opacity)
      .setDepth(depth - SHADOW_DEPTH_BELOW);
    if (area !== undefined) this.#follow(area, figure, walker.position);
  }
}
