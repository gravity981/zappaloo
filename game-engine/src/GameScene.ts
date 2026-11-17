// The game world scene (sw-architecture.md 3.1, 3.5, 14.4; GAME-01, GAME-02, GAME-03, GAME-07, GAME-09, GAME-10,
// GAME-19). It draws the active map and the player's figure, reads the arrow keys and taps, and follows the player
// with the camera at the map's zoom. What the map means (collisions, paths, portals, draw order) is in the plain
// modules next to it; this scene only wires them to Phaser.
import Phaser from "phaser";
import { walkable, cellOf, cellCentre } from "./collision.ts";
import { walkFrameIndex } from "./figures.ts";
import { figureDepth } from "./draw-order.ts";
import { type Point, polygonCentre, tileToPixel, type TileSize } from "./geometry.ts";
import { findPath, type Grid } from "./pathfinding.ts";
import { directionOf, keyDirection, stepPosition, type Direction } from "./movement.ts";
import { portalAt, spawnPosition } from "./entry.ts";
import type { ParsedMap, TileDraw } from "./map-model.ts";
import type { FigureData, LoadedWorld } from "./world-data.ts";
import {
  ENGINE_CONFIG_REGISTRY_KEY,
  WORLD_SCENE_KEY,
  type GameGuides,
  type GameEngineOptions,
  type GameHost,
  type GameSelection,
  type GameView,
} from "./host.ts";

/** The zoom of the camera; fixed for every map (decided 2026-11-15). */
export const CAMERA_ZOOM = 2;

/** The walking speed, in tile widths per second. */
const SPEED_TILES_PER_SECOND = 1.4;

/** The radius of a figure, in tile widths: how close it may come to a blocked shape. */
const RADIUS_TILES = 0.2;

/** The distance in pixels at which a waypoint counts as reached. */
const REACHED = 1;
const DEFAULT_GUIDES: GameGuides = {
  collisions: false,
  borders: false,
  spawns: false,
  portals: false,
  occlusion: false,
  grid: false,
};

/** The data the scene starts with. Without it, the scene enters the world where the guest was last. */
export interface WorldSceneData {
  mapId?: string;
  spawn?: string;
  artworkOnly?: boolean;
  zoom?: number;
}

function centreOf(cell: { column: number; row: number }, size: TileSize): Point {
  return cellCentre(cell.column, cell.row, size);
}

export class WorldScene extends Phaser.Scene {
  #world: LoadedWorld | undefined;
  #host: GameHost | undefined;
  #map: ParsedMap | undefined;
  #guides: GameGuides = DEFAULT_GUIDES;
  #guideGraphics: Phaser.GameObjects.Graphics | undefined;
  #position: Point = { x: 0, y: 0 };
  #player: Phaser.GameObjects.Sprite | undefined;
  #figure: FigureData | undefined;
  #direction: Direction = "south";
  #artworkOnly = false;
  #zoom: number | undefined;
  #view: GameView | undefined;
  #walkClock = 0;
  /** Waypoints of a tap-to-move walk, in pixels. */
  #path: Point[] = [];
  /** Whether portals may take the player: false while the player stands in one after arriving. */
  #armed = true;
  #transitioning = false;
  #cursor: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  #wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key> | undefined;
  readonly #onTap = (pointer: Phaser.Input.Pointer): void => {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.#tapTo({ x: world.x, y: world.y });
  };

  constructor() {
    super(WORLD_SCENE_KEY);
  }

  init(data: WorldSceneData): void {
    const options = this.game.registry.get(ENGINE_CONFIG_REGISTRY_KEY) as GameEngineOptions;
    const { world, host, view, guides } = options;
    this.#world = world;
    this.#host = host;
    const map =
      world.maps.get(data.mapId ?? host.selection.mapId) ?? world.maps.get(world.startMap);
    if (map === undefined) throw new Error("the world has no start map");
    this.#map = map;
    this.#artworkOnly = data.artworkOnly ?? this.#view?.artworkOnly ?? view?.artworkOnly ?? false;
    this.#zoom = data.zoom ?? this.#view?.zoom ?? view?.zoom;
    this.#view = { artworkOnly: this.#artworkOnly, zoom: this.#zoom ?? CAMERA_ZOOM };
    this.#guides = { ...DEFAULT_GUIDES, ...guides };
    this.#figure =
      world.figures.find((figure) => figure.id === host.selection.figureId) ?? world.figures[0];
    const spawn = data.spawn ?? (map.id === host.selection.mapId ? host.selection.spawn : "start");
    this.#position = spawnPosition(map, spawn) ?? { x: 0, y: 0 };
    this.#player = undefined;
    this.#direction = "south";
    this.#walkClock = 0;
    this.#path = [];
    this.#transitioning = false;
  }

  preload(): void {
    const world = this.#world;
    if (world === undefined) return;
    for (const [key, url] of world.images) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(): void {
    const map = this.#map;
    if (map === undefined) return;
    this.cameras.main.setBackgroundColor(this.#artworkOnly ? "rgba(0,0,0,0)" : "#2d6a4f");
    this.cameras.main.setZoom(this.#artworkOnly ? (this.#zoom ?? 1) : CAMERA_ZOOM);
    this.#drawMap(map);
    this.#guideGraphics = this.add.graphics().setDepth(1_000_000);
    this.#drawGuides();
    this.#armed = portalAt(map, this.#position) === undefined;
    if (!this.#artworkOnly && this.#figure !== undefined) {
      const sprite = this.add.sprite(
        this.#position.x,
        this.#position.y,
        this.#figure.standing.south,
      );
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(figureDepth(this.#position, map.occluders));
      this.#player = sprite;
      this.cameras.main.startFollow(sprite, true);
    }
    const size = map.size;
    this.cameras.main.setBounds(
      -map.rows * (size.width / 2),
      0,
      (map.columns + map.rows) * (size.width / 2),
      (map.columns + map.rows) * (size.height / 2),
    );
    if (this.#artworkOnly) {
      this.cameras.main.centerOn(
        ((map.columns - map.rows) * size.width) / 4,
        ((map.columns + map.rows) * size.height) / 4,
      );
    }
    this.#bindInput();
    if (!this.#artworkOnly) this.#host?.rememberMap?.(map.id);

    this.#host?.onStateChange?.(() => {
      const camera = this.cameras.main;
      return {
        mapId: map.id,
        x: Math.round(this.#position.x),
        y: Math.round(this.#position.y),
        direction: this.#direction,
        view: {
          x: camera.midPoint.x,
          y: camera.midPoint.y,
          zoom: camera.zoom,
          width: camera.width,
          height: camera.height,
        },
      };
    });
    this.#host?.onReady?.();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.#onTap);
      this.#host?.onStateChange?.(null);
      this.#guideGraphics = undefined;
    });
  }

  setGuides(guides: GameGuides): void {
    this.#guides = { ...guides };
    this.#drawGuides();
  }

  setSelection(selection: GameSelection): void {
    const host = this.#host;
    if (host === undefined) return;
    host.selection = selection;
    this.scene.restart({ mapId: selection.mapId, spawn: selection.spawn });
  }

  setView(view: GameView): void {
    const host = this.#host;
    if (host === undefined) return;
    this.#view = view;
    this.scene.restart({
      mapId: host.selection.mapId,
      spawn: host.selection.spawn,
      artworkOnly: view.artworkOnly,
      zoom: view.zoom,
    });
  }

  override update(_time: number, delta: number): void {
    const map = this.#map;
    const figure = this.#figure;
    const player = this.#player;
    if (map === undefined || figure === undefined || player === undefined || this.#transitioning)
      return;
    const size = map.size;
    const radius = size.width * RADIUS_TILES;
    const isWalkable = (point: Point) => walkable(map.obstacles, point, radius);
    const step = (size.width * SPEED_TILES_PER_SECOND * delta) / 1000;

    // The keys win over a walk to a point. Otherwise the walk heads for its next waypoint, skipping the ones reached.
    let move = keyDirection(this.#keys());
    const keysHeld = move.x !== 0 || move.y !== 0;
    if (keysHeld) this.#path = [];
    while (!keysHeld && this.#path.length > 0) {
      const next = this.#path[0];
      if (next === undefined) break;
      const dx = next.x - this.#position.x;
      const dy = next.y - this.#position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > REACHED) {
        move = { x: dx / distance, y: dy / distance };
        break;
      }
      this.#path.shift();
    }
    const walking = !keysHeld && move.x !== 0;

    const before = this.#position;
    const after = stepPosition(before, { x: move.x * step, y: move.y * step }, isWalkable);
    const moved = after.x !== before.x || after.y !== before.y;
    // A walk stops where its way is blocked, so it does not hang on a wall.
    if (walking && !moved) this.#path = [];
    this.#position = after;
    if (moved) this.#direction = directionOf(move);
    this.#walkClock = moved ? this.#walkClock + delta : 0;

    const frames = figure.walk[this.#direction];
    const texture =
      moved && frames.length > 0
        ? frames[walkFrameIndex(this.#walkClock, frames.length)]
        : figure.standing[this.#direction];
    if (texture !== undefined && player.texture.key !== texture) player.setTexture(texture);
    // Whole pixels: a fractional position is snapped differently from frame to frame, which made things shimmer.
    player.setPosition(Math.round(this.#position.x), Math.round(this.#position.y));
    player.setDepth(figureDepth(this.#position, map.occluders));

    const portal = portalAt(map, this.#position);
    if (!this.#armed) {
      if (portal === undefined) this.#armed = true;
    } else if (portal?.targetMap !== undefined) {
      this.#transition(portal.targetMap, portal.targetSpawn);
    }
  }

  /** Draws the ground, then the objects in depth order. The player is drawn among them. */
  #drawMap(map: ParsedMap): void {
    for (const draw of map.ground) this.#drawTile(draw);
    for (const draw of map.objects) this.#drawTile(draw);
  }

  #drawGuides(): void {
    const graphics = this.#guideGraphics;
    const map = this.#map;
    if (graphics === undefined || map === undefined) return;
    graphics.clear();

    const stroke = (points: readonly Point[], color: number): void => {
      const first = points[0];
      if (first === undefined || points.length < 2) return;
      graphics.lineStyle(2, color, 0.9);
      graphics.beginPath();
      graphics.moveTo(first.x, first.y);
      for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.closePath();
      graphics.strokePath();
    };
    const fill = (points: readonly Point[]): void => {
      graphics.fillPoints(
        points.map(({ x, y }) => new Phaser.Math.Vector2(x, y)),
        true,
      );
    };

    if (this.#guides.grid || this.#guides.collisions) {
      for (let row = 0; row < map.rows; row++) {
        for (let column = 0; column < map.columns; column++) {
          const top = tileToPixel({ x: column, y: row }, map.size);
          const halfWidth = map.size.width / 2;
          const halfHeight = map.size.height / 2;
          const polygon = [
            top,
            { x: top.x + halfWidth, y: top.y + halfHeight },
            { x: top.x, y: top.y + map.size.height },
            { x: top.x - halfWidth, y: top.y + halfHeight },
          ];
          const blocked = map.obstacles.blockedCells.has(`${String(column)},${String(row)}`);
          if (blocked && this.#guides.collisions) {
            graphics.fillStyle(0xff3b30, 0.3);
            fill(polygon);
          }
          if (this.#guides.grid) stroke(polygon, blocked ? 0xff3b30 : 0xffffff);
        }
      }
    }

    if (this.#guides.collisions) {
      for (const polygon of map.obstacles.solids) stroke(polygon, 0xff3b30);
    }
    if (this.#guides.borders) {
      for (const polygon of map.obstacles.borders) stroke(polygon, 0x36a3ff);
    }
    if (this.#guides.spawns) {
      graphics.fillStyle(0x36a3ff, 0.9);
      for (const point of map.spawns.values()) graphics.fillCircle(point.x, point.y, 5);
    }
    if (this.#guides.portals) {
      for (const portal of map.portals) {
        graphics.fillStyle(0xb35cff, 0.25);
        fill(portal.polygon);
        stroke(portal.polygon, 0xb35cff);
      }
    }
    if (this.#guides.occlusion) {
      for (const occluder of map.occluders) stroke(occluder.line, 0xffd23f);
    }
  }

  /**
   * Draws a tile as a frame of its image. A frame is a rectangle of the texture (a sheet's cell, or the whole image
   * of a collection tile); frames are Phaser's own, so no crop of the texture is needed.
   */
  #drawTile(draw: TileDraw): void {
    const { image } = draw;
    const { x, y, width, height } = image.crop;
    const frame = `${String(x)},${String(y)},${String(width)},${String(height)}`;
    const texture = this.textures.get(image.key);
    if (!texture.has(frame)) texture.add(frame, 0, x, y, width, height);
    const sprite = this.add
      .image(Math.round(draw.x), Math.round(draw.y), image.key, frame)
      .setOrigin(0, 0)
      .setDepth(draw.depth);
    sprite.setScale(draw.width / width, draw.height / height);
  }

  #bindInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      this.#cursor = keyboard.createCursorKeys();
      this.#wasd = {
        W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.#onTap);
  }

  /** The arrow keys, and W A S D, as they are held. */
  #keys(): { left: boolean; right: boolean; up: boolean; down: boolean } {
    const cursor = this.#cursor;
    const wasd = this.#wasd;
    return {
      left: cursor?.left.isDown === true || wasd?.A.isDown === true,
      right: cursor?.right.isDown === true || wasd?.D.isDown === true,
      up: cursor?.up.isDown === true || wasd?.W.isDown === true,
      down: cursor?.down.isDown === true || wasd?.S.isDown === true,
    };
  }

  /** Tap-to-move (GAME-10): walks around the blocked shapes to the tapped point, or into a portal. */
  #tapTo(point: Point): void {
    const map = this.#map;
    if (map === undefined) return;
    const size = map.size;
    const radius = size.width * RADIUS_TILES;
    const portal = portalAt(map, point);
    if (portal === undefined && !walkable(map.obstacles, point, radius)) return;
    const goal = portal === undefined ? point : polygonCentre(portal.polygon);
    const grid: Grid = {
      columns: map.columns,
      rows: map.rows,
      walkable: (cell) => walkable(map.obstacles, centreOf(cell, size), radius),
    };
    const cells = findPath(grid, cellOf(this.#position, size), cellOf(goal, size));
    if (cells === undefined) return;
    this.#path = cells.slice(1).map((cell) => centreOf(cell, size));
    if (portal !== undefined) this.#path.push(goal);
  }

  #transition(mapId: string, spawn: string | undefined): void {
    this.#transitioning = true;
    this.scene.restart({ mapId, spawn: spawn ?? "start" });
  }
}
