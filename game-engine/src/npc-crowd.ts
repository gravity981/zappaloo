// The NPCs of one map as the scene draws them (GAME-36, GAME-38): a figure with the shadow of the player's figure,
// walking its path with the walk animation, or standing and waving now and then. NPCs are simulated on this device
// only and do not block the player. An NPC with an action is tappable: the crowd keeps a clickable area for it that
// follows the figure, which the scene's tap, Enter and arrival logic read like those of an object (14.2, 14.4).
import { gameRandom } from "./random.ts";
import Phaser from "phaser";
import type { PublicNpc, WorldObjectAction } from "@zappaloo/shared";
import type { BubbleBoard, BubbleParticipant } from "./bubble-board.ts";
import { GREETING_BUBBLE_CLOSE_TILES, GREETING_BUBBLE_OPEN_TILES } from "./bubble.ts";
import { figureDepth } from "./draw-order.ts";
import { SHADOW_DEPTH_BELOW, figureShadow } from "./figure-shadow.ts";
import { walkFrameIndex } from "./figures.ts";
import { GUEST_SPEED_FACTOR } from "./guest-crowd.ts";
import type { Point } from "./geometry.ts";
import { type ClickableArea, type NpcSpec, type ParsedMap } from "./map-model.ts";
import { directionOf, SPEED_TILES_PER_SECOND } from "./movement.ts";
import { npcKey, npcTitle } from "./npc-texts.ts";
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
  /** Whether its speech bubble is open (test hook, GAME-37). */
  bubble: boolean;
}

interface Member {
  spec: NpcSpec;
  figure: FigureData;
  walker: NpcWalker;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  /** The clickable area of an NPC with an action; it moves with the figure. */
  area: ClickableArea | undefined;
  /** What the admin gave it: name, short dialog and portrait (MAP-21). */
  texts: PublicNpc | undefined;
  /** Milliseconds of walking, which the walk animation runs on. */
  clock: number;
}

export class NpcCrowd {
  readonly #map: ParsedMap;
  readonly #zoom: number;
  readonly #ratio: () => number;
  readonly #members: Member[] = [];
  readonly #board: BubbleBoard | undefined;
  /** What a tap on the bubble of an NPC with an action does: walk to it and run the action. */
  readonly #onTap: ((area: ClickableArea) => void) | undefined;
  /** The NPC the player walks to, which waits for them. */
  #held: string | undefined;

  constructor(
    scene: Phaser.Scene,
    map: ParsedMap,
    world: LoadedWorld,
    zoom: number,
    ratio: () => number,
    board?: BubbleBoard,
    onTap?: (area: ClickableArea) => void,
  ) {
    this.#board = board;
    this.#onTap = onTap;
    this.#map = map;
    this.#zoom = zoom;
    this.#ratio = ratio;
    for (const spec of map.npcs) {
      const figure = world.figures.find((item) => item.id === spec.figure);
      if (figure === undefined) continue;
      const walker = new NpcWalker(spec.position, {
        path: spec.path,
        initialWait: gameRandom() * waitDuration(gameRandom),
        waveDuration: waveLength(figure),
        random: gameRandom,
      });
      const sprite = scene.add.sprite(0, 0, figure.standing.south).setOrigin(0.5, 1);
      const shadow = scene.add.ellipse(0, 0, 1, 1, 0x000000, 1);
      const area = this.#areaOf(spec, figure, walker, world);
      const texts = world.npcs.get(npcKey(map.id, spec.name));
      const member: Member = { spec, figure, walker, sprite, shadow, area, texts, clock: 0 };
      this.#members.push(member);
      this.#place(member);
    }
  }

  /** The tappable NPCs, as clickable areas that follow the figures. */
  get areas(): ClickableArea[] {
    return this.#members.flatMap((member) => (member.area === undefined ? [] : [member.area]));
  }

  /** Every NPC's body as a polygon where it stands now, with its name and label: what its edge indicator points at. */
  get bodies(): {
    name: string;
    label?: string;
    preset?: WorldObjectAction;
    polygon: Point[];
  }[] {
    return this.#members.map(({ spec, figure, walker }) => ({
      name: spec.name,
      ...(spec.label === undefined ? {} : { label: spec.label }),
      ...(spec.preset === undefined ? {} : { preset: spec.preset }),
      polygon: this.#bodyOf(figure, walker.position),
    }));
  }

  /** The drawn figure of a tappable NPC by the Tiled id of its object, for its glow. */
  spriteOf(objectId: number): Phaser.GameObjects.Sprite | undefined {
    return this.#members.find((member) => member.spec.objectId === objectId)?.sprite;
  }

  /** The drawn figures, for their silhouettes behind objects (GAME-42). */
  get sprites(): Phaser.GameObjects.Sprite[] {
    return this.#members.map((member) => member.sprite);
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
      bubble: this.#board?.isOpen(`npc:${spec.name}`) ?? false,
    }));
  }

  /**
   * The NPCs whose dialogue has a greeting as bubble participants; one without a greeting has no bubble (GAME-37). The
   * bubble holds the greeting only, no portrait and no name, and it replaces the NPC's label while it is open.
   */
  participants(player: Point): BubbleParticipant[] {
    const onTap = this.#onTap;
    return this.#members.flatMap((member) => {
      const { spec, walker, figure, texts, area } = member;
      if (this.#board === undefined || texts?.dialog === undefined) return [];
      const id = `npc:${spec.name}`;
      return [
        {
          id,
          distance: Math.hypot(walker.position.x - player.x, walker.position.y - player.y),
          // The top of its body, where its label stands too: the sprite is drawn a little lower than its feet.
          head: { x: walker.position.x, y: walker.position.y - figure.size.height },
          content: { name: npcTitle(spec, texts), greeting: texts.dialog, compact: true },
          openTiles: GREETING_BUBBLE_OPEN_TILES,
          closeTiles: GREETING_BUBBLE_CLOSE_TILES,
          // A tap on the bubble does what a tap on the NPC does; an NPC without an action pins it like a guest.
          ...(area === undefined || onTap === undefined
            ? {}
            : {
                onTap: () => {
                  onTap(area);
                },
              }),
        },
      ];
    });
  }

  /** The NPC with this name waits instead of walking on (the player walks to it), or none does. */
  hold(name: string | undefined): void {
    this.#held = name;
  }

  /**
   * One frame: the NPCs walk, stand or wave, and the sprites, shadows and tap areas follow them. An NPC with an open
   * bubble (`shown`) waits and turns to the player, like the NPC the player walks to.
   */
  update(delta: number, player: Point, shown: ReadonlySet<string>): void {
    const map = this.#map;
    const dt = Math.min(delta, MAX_DELTA_MS);
    const step = (map.size.width * SPEED_TILES_PER_SECOND * GUEST_SPEED_FACTOR * dt) / 1000;
    for (const member of this.#members) {
      const { walker } = member;
      walker.held = this.#held === member.spec.name || shown.has(`npc:${member.spec.name}`);
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
      // The name of the NPC, which names the page its action opens (the admin's, else the Tiled label).
      label: npcTitle(spec, world.npcs.get(npcKey(this.#map.id, spec.name))),
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

  /** The box around a figure's body where it stands. */
  #bodyOf(figure: FigureData, at: Point): Point[] {
    const halfWidth = Math.max(figure.size.width / 3, 6);
    return [
      { x: at.x - halfWidth, y: at.y - figure.size.height },
      { x: at.x + halfWidth, y: at.y - figure.size.height },
      { x: at.x + halfWidth, y: at.y },
      { x: at.x - halfWidth, y: at.y },
    ];
  }

  /** Puts an area where the figure stands: a box around its body, and the approach point half a tile below it. */
  #follow(area: ClickableArea, figure: FigureData, at: Point): void {
    area.polygon = this.#bodyOf(figure, at);
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
