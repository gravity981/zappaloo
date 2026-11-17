// The game world scene (sw-architecture.md 3.1, 3.5, 14.4; GAME-01, GAME-02, GAME-03, GAME-07, GAME-09, GAME-10,
// GAME-19). It draws the active map and the player's figure, reads the arrow keys and taps, and follows the player
// with the camera at the map's zoom. What the map means (collisions, paths, portals, draw order) is in the plain
// modules next to it; this scene only wires them to Phaser.
import Phaser from "phaser";
import { walkable, cellOf, cellCentre, playerCollisionEllipse } from "./collision.ts";
import { walkFrameIndex } from "./figures.ts";
import { figureDepth, figureOcclusionSegment, occlusionSegmentRelation } from "./draw-order.ts";
import { mapBounds, type Point, polygonCentre, tileToPixel, type TileSize } from "./geometry.ts";
import { findPath, type Grid } from "./pathfinding.ts";
import { directionOf, keyDirection, stepPosition, type Direction } from "./movement.ts";
import { portalAt, spawnPosition } from "./entry.ts";
import { playerSpritePosition } from "./player-anchor.ts";
import { tilesetImageKey, type ParsedMap, type TileDraw } from "./map-model.ts";
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

/** The distance in pixels at which a waypoint counts as reached. */
const REACHED = 1;
const DEFAULT_GUIDES: GameGuides = {
  collisions: false,
  borders: false,
  spawns: false,
  portals: false,
  grid: false,
  occlusion: false,
};

/** The data the scene starts with. Without it, the scene enters the world where the guest was last. */
export interface WorldSceneData {
  mapId?: string;
  spawn?: string;
  artworkOnly?: boolean;
  zoom?: number;
  nativeObjects?: boolean;
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
  #occlusionGraphics: Phaser.GameObjects.Graphics | undefined;
  #occlusionActorGraphics: Phaser.GameObjects.Graphics | undefined;
  #collisionActorGraphics: Phaser.GameObjects.Graphics | undefined;
  #position: Point = { x: 0, y: 0 };
  #player: Phaser.GameObjects.Sprite | undefined;
  #figure: FigureData | undefined;
  #direction: Direction = "south";
  #artworkOnly = false;
  #nativeObjects = false;
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
    this.#nativeObjects = data.nativeObjects ?? true;
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
    this.#occlusionGraphics = this.add.graphics().setDepth(1_000_001);
    this.#occlusionActorGraphics = this.add.graphics().setDepth(1_000_002);
    this.#collisionActorGraphics = this.add.graphics().setDepth(1_000_003);
    this.#drawGuides();
    this.#drawOcclusionGuides();
    this.#armed = portalAt(map, this.#position) === undefined;
    if (!this.#artworkOnly && this.#figure !== undefined) {
      const spritePosition = playerSpritePosition(this.#position);
      const sprite = this.add.sprite(
        spritePosition.x,
        spritePosition.y,
        this.#figure.standing.south,
      );
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(figureDepth(this.#position, map.occluders, map.size.width));
      this.#player = sprite;
      this.cameras.main.startFollow(sprite, true);
    }
    this.#drawOcclusionActor();
    this.#drawCollisionActor();
    const bounds = mapBounds(map.columns, map.rows, map.size);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.#artworkOnly) {
      this.cameras.main.centerOn(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
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
      this.#occlusionGraphics = undefined;
      this.#occlusionActorGraphics = undefined;
      this.#collisionActorGraphics = undefined;
    });
  }

  setGuides(guides: GameGuides): void {
    this.#guides = { ...guides };
    this.#drawGuides();
    this.#drawOcclusionGuides();
    this.#drawOcclusionActor();
    this.#drawCollisionActor();
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

  renderStack(): { type: string; depth: number }[] {
    return this.children.list.flatMap((object) => {
      if (!("depth" in object) || typeof object.depth !== "number") return [];
      return [{ type: object.type, depth: object.depth }];
    });
  }

  override update(_time: number, delta: number): void {
    const map = this.#map;
    const figure = this.#figure;
    const player = this.#player;
    if (map === undefined || figure === undefined || player === undefined || this.#transitioning)
      return;
    const size = map.size;
    const isWalkable = (point: Point) =>
      walkable(map.obstacles, playerCollisionEllipse(point, size.width));
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
    const spritePosition = playerSpritePosition(this.#position);
    player.setPosition(spritePosition.x, spritePosition.y);
    player.setDepth(figureDepth(this.#position, map.occluders, map.size.width));
    this.#drawOcclusionActor();
    this.#drawCollisionActor();

    const portal = portalAt(map, this.#position);
    if (!this.#armed) {
      if (portal === undefined) this.#armed = true;
    } else if (portal?.targetMap !== undefined) {
      this.#transition(portal.targetMap, portal.targetSpawn);
    }
  }

  /** Draws the ground, then the objects in depth order. The player is drawn among them. */
  #drawMap(map: ParsedMap): void {
    const native = this.#drawNativeLayers(map, this.#nativeObjects);
    if (!native.ground) {
      for (const draw of map.ground) this.#drawTile(draw);
    }
    if (!native.objects) {
      for (const draw of map.objects) this.#drawTile(draw);
    }
  }

  /** Use Phaser's native isometric renderer for sheet and image-collection tile layers. */
  #drawNativeLayers(
    map: ParsedMap,
    drawObjects: boolean,
  ): {
    ground: boolean;
    objects: boolean;
  } {
    if (map.ground.length === 0) {
      return { ground: false, objects: false };
    }

    const cacheKey = `world-map:${map.id}`;
    this.cache.tilemap.remove(cacheKey);
    this.cache.tilemap.add(cacheKey, {
      format: Phaser.Tilemaps.Formats.TILED_JSON,
      data: map.source,
    });

    try {
      const tilemap = this.make.tilemap({ key: cacheKey });
      const imageKeys = new Set(
        [...map.ground, ...(drawObjects ? map.objects : [])].map((draw) => draw.image.key),
      );
      const tilesets: Phaser.Tilemaps.Tileset[] = [];
      for (const set of map.source.tilesets) {
        if (set.image !== undefined) {
          const key = tilesetImageKey(set.image);
          if (!imageKeys.has(key)) continue;
          const tileset = tilemap.addTilesetImage(set.name, key);
          if (tileset === null) throw new Error(`Could not load tileset ${set.name}`);
          continue;
        }

        for (const tile of set.tiles ?? []) {
          if (tile.image === undefined) continue;
          const firstgid = set.firstgid + tile.id;
          const tileset = tilemap.tilesets.find((candidate) => candidate.firstgid === firstgid);
          if (tileset === undefined)
            throw new Error(`Could not find image-collection tile ${String(firstgid)}`);
          const key = tilesetImageKey(tile.image);
          if (!imageKeys.has(key)) continue;
          if (!this.textures.exists(key)) throw new Error(`Could not load tileset image ${key}`);
          tileset.setImage(this.textures.get(key));
        }
      }

      tilesets.push(...tilemap.tilesets.filter((tileset) => tileset.image !== null));
      const layerOrder = new Map<number, number>();
      let nextOrder = 0;
      const indexLayers = (layers: typeof map.source.layers): void => {
        for (const layer of layers) {
          if (layer.type === "group") indexLayers(layer.layers);
          else {
            if (layer.id !== undefined) layerOrder.set(layer.id, nextOrder);
            nextOrder += 1;
          }
        }
      };
      indexLayers(map.source.layers);
      const actorLayerOrder = Math.min(
        ...tilemap.objects
          .filter(
            (layer) =>
              layer.visible &&
              layer.objects.some((object) => object.visible && object.gid !== undefined),
          )
          .map((layer) => layerOrder.get(layer.id) ?? Number.POSITIVE_INFINITY),
      );
      for (const layer of tilemap.layers) {
        if (!layer.visible || layer.name.split("/").at(-1) === "collision") continue;
        const displayLayer = tilemap.createLayer(layer.name, tilesets, 0, 0);
        const order = layerOrder.get(layer.id) ?? 0;
        const depth =
          order > actorLayerOrder ? 1_000_000 + order * 1000 : -1_000_000 + order * 1000;
        displayLayer.setDepth(depth);
      }
      const objects = drawObjects && this.#drawNativeTileObjects(map, tilemap);
      return { ground: true, objects };
    } finally {
      this.cache.tilemap.remove(cacheKey);
    }
  }

  /** Use Phaser's object conversion for bottom-aligned image-collection objects with zero offsets. */
  #drawNativeTileObjects(map: ParsedMap, tilemap: Phaser.Tilemaps.Tilemap): boolean {
    if (map.objects.length === 0) return true;
    if (map.source.layers.some((layer) => layer.type === "group")) {
      return false;
    }

    const tiles = new Map<
      number,
      {
        key: string;
        alignment: string | undefined;
        offset: { x: number; y: number };
      }
    >();
    for (const set of map.source.tilesets) {
      if (set.image !== undefined) continue;
      for (const tile of set.tiles ?? []) {
        if (tile.image === undefined) continue;
        tiles.set(set.firstgid + tile.id, {
          key: tilesetImageKey(tile.image),
          alignment: set.objectalignment,
          offset: { x: set.tileoffset?.x ?? 0, y: set.tileoffset?.y ?? 0 },
        });
      }
    }

    const objects = tilemap.objects
      .filter((layer) => layer.visible)
      .flatMap((layer) =>
        layer.objects.filter((object) => object.visible && object.gid !== undefined),
      );
    const layers = tilemap.objects.filter(
      (layer) =>
        layer.visible && layer.objects.some((object) => object.visible && object.gid !== undefined),
    );
    if (objects.length !== map.objects.length || layers.length !== 1) return false;
    const layer = layers[0];
    if (layer === undefined) return false;
    const sourceLayer = map.source.layers.find(
      (candidate) => candidate.type === "objectgroup" && candidate.id === layer.id,
    );
    if (sourceLayer === undefined || (sourceLayer.draworder ?? "topdown") !== "topdown")
      return false;
    if (
      map.objects.some(
        (draw) =>
          !draw.image.collection ||
          draw.width !== draw.image.width ||
          draw.height !== draw.image.height,
      )
    ) {
      return false;
    }

    const objectTiles = objects.map((object) =>
      object.gid === undefined ? undefined : tiles.get(object.gid),
    );
    if (
      objectTiles.some(
        (tile) =>
          tile === undefined ||
          (tile.alignment ?? "bottom") !== "bottom" ||
          tile.offset.x !== 0 ||
          tile.offset.y !== 0,
      )
    ) {
      return false;
    }

    for (const [index, object] of objects.entries()) {
      const tile = objectTiles[index];
      if (object.gid === undefined || tile === undefined) return false;
      const sprite = tilemap.createFromObjects(layer.name, {
        id: object.id,
        key: tile.key,
        frame: this.textures.get(tile.key).firstFrame,
        ignoreTileset: true,
      })[0];
      if (!(sprite instanceof Phaser.GameObjects.Sprite)) return false;
      const feetY = sprite.y + (1 - sprite.originY) * sprite.displayHeight;
      sprite.setDepth(feetY + index / 1000);
    }

    return true;
  }

  #drawGuides(): void {
    const graphics = this.#guideGraphics;
    const map = this.#map;
    if (graphics === undefined || map === undefined) return;
    graphics.clear();
    if (this.#artworkOnly) return;

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
  }

  #drawOcclusionGuides(): void {
    const graphics = this.#occlusionGraphics;
    const map = this.#map;
    if (graphics === undefined || map === undefined) return;
    graphics.clear();
    const visible = this.#guides.occlusion && !this.#artworkOnly;
    graphics.setVisible(visible);
    if (!visible) return;

    graphics.lineStyle(3, 0x00e5ff, 1);
    for (const { line } of map.occluders) {
      const first = line[0];
      if (first === undefined || line.length < 2) continue;
      graphics.beginPath();
      graphics.moveTo(first.x, first.y);
      for (const point of line.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.strokePath();
      graphics.fillStyle(0xffffff, 1);
      for (const point of line) graphics.fillCircle(point.x, point.y, 3);
    }
  }

  #drawOcclusionActor(): void {
    const graphics = this.#occlusionActorGraphics;
    const map = this.#map;
    if (graphics === undefined || map === undefined) return;
    const visible = this.#guides.occlusion && !this.#artworkOnly && this.#player !== undefined;
    if (!visible) {
      if (graphics.visible) graphics.clear();
      graphics.setVisible(false);
      return;
    }
    graphics.setVisible(true);
    graphics.clear();

    const segment = figureOcclusionSegment(this.#position, map.size.width);
    const intersections: Point[] = [];
    for (const { line } of map.occluders) {
      const relation = occlusionSegmentRelation(segment, line);
      if (relation === undefined) continue;
      const color = relation.behind ? 0xff5d73 : 0x4dff88;
      graphics.lineStyle(2, color, 0.9);
      graphics.lineBetween(
        relation.sample.x,
        segment.center.y,
        relation.sample.x,
        relation.sample.y,
      );
      graphics.fillStyle(color, 1);
      graphics.fillCircle(relation.sample.x, relation.sample.y, 3);
      intersections.push(...relation.intersections);
    }

    graphics.lineStyle(2, 0xffff00, 1);
    graphics.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y);
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(segment.center.x, segment.center.y, 2);
    for (const point of intersections) graphics.fillCircle(point.x, point.y, 3);
  }

  #drawCollisionActor(): void {
    const graphics = this.#collisionActorGraphics;
    const map = this.#map;
    if (graphics === undefined || map === undefined) return;
    const visible = this.#guides.collisions && !this.#artworkOnly && this.#player !== undefined;
    if (!visible) {
      if (graphics.visible) graphics.clear();
      graphics.setVisible(false);
      return;
    }
    graphics.setVisible(true);
    graphics.clear();

    const ellipse = playerCollisionEllipse(this.#position, map.size.width);
    graphics.lineStyle(2, 0xffa500, 1);
    graphics.strokeEllipse(
      ellipse.center.x,
      ellipse.center.y,
      ellipse.radiusX * 2,
      ellipse.radiusY * 2,
    );
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(ellipse.center.x, ellipse.center.y, 2);
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
    const portal = portalAt(map, point);
    if (portal === undefined && !walkable(map.obstacles, playerCollisionEllipse(point, size.width)))
      return;
    const goal = portal === undefined ? point : polygonCentre(portal.polygon);
    const grid: Grid = {
      columns: map.columns,
      rows: map.rows,
      walkable: (cell) =>
        walkable(map.obstacles, playerCollisionEllipse(centreOf(cell, size), size.width)),
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
