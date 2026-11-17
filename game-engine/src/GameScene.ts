// The game world scene (sw-architecture.md 3.1, 3.5, 14.4; GAME-01, GAME-02, GAME-03, GAME-07, GAME-09, GAME-10,
// GAME-19). It draws the active map and the player's figure, reads the arrow keys and taps, and follows the player
// with the camera at the map's zoom. What the map means (collisions, paths, portals, draw order) is in the plain
// modules next to it; this scene only wires them to Phaser.
import Phaser from "phaser";
import { walkable, cellOf, playerCollisionEllipse } from "./collision.ts";
import { walkFrameIndex } from "./figures.ts";
import { figureDepth, figureOcclusionSegment, occlusionSegmentRelation } from "./draw-order.ts";
import { interiorPoint, mapBounds, type Point, polygonCentre, tileToPixel } from "./geometry.ts";
import { cellKey, findPath, reachableCells, type Cell, type Grid } from "./pathfinding.ts";
import {
  navigationGrid,
  nearestReachablePoint,
  routeToPoint,
  startCells,
  walkRoute,
} from "./navigation.ts";
import {
  directionOf,
  keyDirection,
  SPEED_TILES_PER_SECOND,
  stepPosition,
  WalkWatch,
  type Direction,
} from "./movement.ts";
import { portalAt, spawnPosition } from "./entry.ts";
import {
  actionOf,
  arrivedAt,
  clickableAt,
  clickableInReach,
  MAX_SPARKLES,
  nextShineDelay,
  nextSparkleDelay,
  shineGradient,
  visibleEdge,
} from "./interaction.ts";
import { onAvatar, playerSpritePosition } from "./player-anchor.ts";
import { isTypingTarget } from "./keys.ts";
import { startsPaused } from "./pause.ts";
import { tilesetImageKey, type ClickableArea, type ParsedMap, type TileDraw } from "./map-model.ts";
import type { FigureData, LoadedWorld } from "./world-data.ts";
import {
  ENGINE_CONFIG_REGISTRY_KEY,
  PIXEL_RATIO_REGISTRY_KEY,
  WORLD_SCENE_KEY,
  type GameGuides,
  type GameEngineOptions,
  type GameHost,
  type GameSelection,
  type GameView,
} from "./host.ts";

/** The zoom of the camera; fixed for every map (decided 2026-11-15). */
export const CAMERA_ZOOM = 2;

/** The distance in pixels at which a waypoint counts as reached. */
const REACHED = 1;
/** The keys the browser would use to scroll or press a button; the game takes them while it runs (GAME-09). */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
/** The keys that activate a clickable object. */
const ACTIVATE_CODES = new Set(["Enter", "Space"]);
const DEFAULT_GUIDES: GameGuides = {
  collisions: false,
  borders: false,
  spawns: false,
  portals: false,
  grid: false,
  occlusion: false,
};

/** The navigation grid of a map and the cells reachable from each start cell worked out so far (GAME-23). */
interface MapNavigation {
  map: ParsedMap;
  grid: Grid;
  reachable: Map<string, ReadonlySet<string>>;
}

/** The data the scene starts with. Without it, the scene enters the world where the guest was last. */
export interface WorldSceneData {
  mapId?: string;
  spawn?: string;
  artworkOnly?: boolean;
  zoom?: number;
  nativeObjects?: boolean;
}

/** The drawn picture of a tile object: a sprite when Phaser's native renderer drew it, an image otherwise. */
type ObjectPicture = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

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
  /** The clickable object a walk leads to: its action runs when the avatar arrives (GAME-16). */
  #pending: ClickableArea | undefined;
  /** The arrows of the portals by the Tiled id of their tile object, which wobble (GAME-15). */
  #objectSprites = new Map<number, ObjectPicture>();
  /** How many sparkles have appeared in this map, and how many are visible now (GAME-15). */
  #sparkles = 0;
  #activeSparkles = 0;
  #shines = 0;
  /** The shine textures that are not finished yet; a shine a map change interrupts is removed at shutdown. */
  readonly #shineKeys = new Set<string>();
  /** The visible edge of each tile object's picture in map pixels, by object name (GAME-15). */
  #edges = new Map<string, Point[]>();
  #sparkleTimer: Phaser.Time.TimerEvent | undefined;
  #shineTimer: Phaser.Time.TimerEvent | undefined;
  #activateKeys: Phaser.Input.Keyboard.Key[] = [];
  #arrows: Record<"left" | "right" | "up" | "down", Phaser.Input.Keyboard.Key> | undefined;
  #wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key> | undefined;
  /** After a resume, the activation keys that were still held do not activate until they are released (GAME-11). */
  #activationBlocked = false;
  /** Whether the walk to the current waypoint still gets nearer; a walk that is stuck is stopped (GAME-10). */
  readonly #walkWatch = new WalkWatch();
  /** The navigation grid of the map and the cells reachable from a start cell, kept while the player taps (GAME-23). */
  #navigation: MapNavigation | undefined;
  readonly #onKeyDown = (event: KeyboardEvent): void => {
    // The scroll and button keys are the game's only while it runs and no field or button of the page has the focus.
    if (
      this.sys.isActive() &&
      SCROLL_KEYS.has(event.code) &&
      !isTypingTarget(document.activeElement)
    ) {
      event.preventDefault();
    }
  };
  readonly #onKeyUp = (event: KeyboardEvent): void => {
    if (ACTIVATE_CODES.has(event.code)) this.#activationBlocked = false;
  };
  readonly #onTap = (pointer: Phaser.Input.Pointer): void => {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // A tap on the player's own avatar goes to the host and does not walk (GAME-18).
    const own = this.#host?.onPlayerTap;
    if (own !== undefined && this.#ownAvatarHit(world)) {
      own();
      return;
    }
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
    this.#pending = undefined;
    this.#objectSprites = new Map();
    this.#sparkles = 0;
    this.#activeSparkles = 0;
    this.#edges = new Map();
    this.#sparkleTimer = undefined;
    this.#shineTimer = undefined;
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
    this.#applyZoom();
    // The canvas has device pixels (GAME-27), so its size changes the zoom's share of the view, and a new pixel
    // ratio (the window moves to another screen) changes the zoom itself.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#onResize);
    this.#drawMap(map);
    // The guides lie above every layer, the foreground ones included (MAP-18).
    this.#guideGraphics = this.add.graphics().setDepth(2_000_000);
    this.#occlusionGraphics = this.add.graphics().setDepth(2_000_001);
    this.#occlusionActorGraphics = this.add.graphics().setDepth(2_000_002);
    this.#collisionActorGraphics = this.add.graphics().setDepth(2_000_003);
    this.#drawGuides();
    this.#drawOcclusionGuides();
    this.#armed = portalAt(map, this.#position) === undefined;
    if (!this.#artworkOnly && this.#figure !== undefined) {
      const spritePosition = playerSpritePosition(this.#position, CAMERA_ZOOM, this.#pixelRatio());
      const sprite = this.add.sprite(
        spritePosition.x,
        spritePosition.y,
        this.#figure.standing.south,
      );
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(figureDepth(this.#position, map.occluders, map.size.width));
      this.#player = sprite;
      // The camera does not follow by itself: it is centred on the snapped sprite in update() (GAME-27).
      this.cameras.main.setRoundPixels(true);
    }
    this.#drawOcclusionActor();
    this.#drawCollisionActor();
    const bounds = mapBounds(map.columns, map.rows, map.size);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.#followPlayer();
    if (this.#artworkOnly) {
      this.cameras.main.centerOn(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    }
    this.#bindInput();
    if (!this.#artworkOnly) {
      this.#floatPortals(map);
      this.#startSparkles(map);
      this.#startShines(map);
      this.#host?.rememberMap?.(map.id);
    }

    this.#host?.onStateChange?.(() => {
      const camera = this.cameras.main;
      return {
        mapId: map.id,
        x: Math.round(this.#position.x),
        y: Math.round(this.#position.y),
        direction: this.#direction,
        sparkles: this.#sparkles,
        view: {
          // In CSS pixels, whatever the pixel ratio of the canvas is.
          x: camera.midPoint.x,
          y: camera.midPoint.y,
          zoom: camera.zoom / this.#pixelRatio(),
          width: camera.width / this.#pixelRatio(),
          height: camera.height / this.#pixelRatio(),
        },
      };
    });
    this.#host?.onReady?.();
    // Phaser sets the scene to running after create() returns, so a pause the page asked for earlier is applied then.
    this.events.once(Phaser.Scenes.Events.CREATE, () => {
      if (startsPaused(this.registry)) this.setPaused(true);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#removeShines();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#onResize);
      window.removeEventListener("keydown", this.#onKeyDown);
      window.removeEventListener("keyup", this.#onKeyUp);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.#onTap);
      this.#sparkleTimer?.remove();
      this.#sparkleTimer = undefined;
      this.#shineTimer?.remove();
      this.#shineTimer = undefined;
      this.#host?.onStateChange?.(null);
      this.#guideGraphics = undefined;
      this.#occlusionGraphics = undefined;
      this.#occlusionActorGraphics = undefined;
      this.#collisionActorGraphics = undefined;
    });
  }

  /** The canvas's device pixels per CSS pixel (GAME-27). */
  #pixelRatio(): number {
    const ratio: unknown = this.game.registry.get(PIXEL_RATIO_REGISTRY_KEY);
    return typeof ratio === "number" ? ratio : 1;
  }

  /** The camera's zoom in device pixels per world pixel: the zoom of the map times the canvas's pixel ratio. */
  #applyZoom(): void {
    const zoom = this.#artworkOnly ? (this.#zoom ?? 1) : CAMERA_ZOOM;
    this.cameras.main.setZoom(zoom * this.#pixelRatio());
  }

  readonly #onResize = (): void => {
    this.#applyZoom();
    this.#followPlayer();
  };

  /** Centres the camera on the player's snapped sprite; the scene has no other camera movement (GAME-27). */
  #followPlayer(): void {
    const player = this.#player;
    if (player === undefined) return;
    const camera = this.cameras.main;
    camera.centerOn(player.x, player.y);
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

  /** Another figure for the player, at once and where the player stands (the avatar editor, AVA-04). */
  setFigure(figureId: string): void {
    const world = this.#world;
    const host = this.#host;
    if (world === undefined || host === undefined) return;
    host.selection = { ...host.selection, figureId };
    this.#figure = world.figures.find((figure) => figure.id === figureId) ?? this.#figure;
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
    if (keysHeld) {
      this.#path = [];
      this.#pending = undefined;
    }
    // Every activation key is read, so a press is used up even when it does not activate.
    const pressed = this.#activateKeys
      .map((key) => Phaser.Input.Keyboard.JustDown(key))
      .some((value) => value);
    if (pressed && !this.#activationBlocked && !isTypingTarget(document.activeElement)) {
      const area = clickableInReach(map, this.#position);
      if (area !== undefined) {
        this.#path = [];
        this.#pending = undefined;
        this.#activate(area);
      }
    }
    let toWaypoint: number | undefined;
    while (!keysHeld && this.#path.length > 0) {
      const next = this.#path[0];
      if (next === undefined) break;
      const dx = next.x - this.#position.x;
      const dy = next.y - this.#position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > REACHED) {
        move = { x: dx / distance, y: dy / distance };
        toWaypoint = distance;
        break;
      }
      this.#path.shift();
      this.#walkWatch.reset();
    }
    const walking = !keysHeld && (move.x !== 0 || move.y !== 0);

    const before = this.#position;
    const after = stepPosition(before, { x: move.x * step, y: move.y * step }, isWalkable);
    const moved = after.x !== before.x || after.y !== before.y;
    // A walk stops where its way is blocked: it does not move at all, or it slides along a wall and gets no nearer.
    if (walking && !moved) this.#stopWalk();
    else if (walking && toWaypoint !== undefined && this.#walkWatch.update(toWaypoint, delta)) {
      this.#stopWalk();
    }
    if (!walking) this.#walkWatch.reset();
    this.#position = after;
    if (moved) this.#direction = directionOf(move);
    this.#walkClock = moved ? this.#walkClock + delta : 0;

    const frames = figure.walk[this.#direction];
    const texture =
      moved && frames.length > 0
        ? frames[walkFrameIndex(this.#walkClock, frames.length)]
        : figure.standing[this.#direction];
    if (texture !== undefined && player.texture.key !== texture) player.setTexture(texture);
    // The sprite and the camera are snapped to the same device-pixel grid (GAME-27).
    const spritePosition = playerSpritePosition(this.#position, CAMERA_ZOOM, this.#pixelRatio());
    player.setPosition(spritePosition.x, spritePosition.y);
    this.#followPlayer();
    player.setDepth(figureDepth(this.#position, map.occluders, map.size.width));
    this.#drawOcclusionActor();
    this.#drawCollisionActor();

    // A walk to an object has ended: the action runs where the avatar stands in front of it (GAME-16).
    const pending = this.#pending;
    if (pending !== undefined && this.#path.length === 0) {
      this.#pending = undefined;
      if (arrivedAt(map, pending, this.#position)) this.#activate(pending);
    }

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
      for (const draw of map.objects) {
        const picture = this.#drawTile(draw);
        if (draw.objectId !== undefined) this.#objectSprites.set(draw.objectId, picture);
      }
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
      // The actor is drawn above the first layer with tile objects; without those, above the first object layer.
      // Without any object layer, every tile layer is ground (an empty minimum would make them all ground anyway).
      const visibleObjectLayers = tilemap.objects.filter((layer) => layer.visible);
      const tileObjectLayers = visibleObjectLayers.filter((layer) =>
        layer.objects.some((object) => object.visible && object.gid !== undefined),
      );
      const actorCandidates = tileObjectLayers.length > 0 ? tileObjectLayers : visibleObjectLayers;
      const actorLayerOrder = Math.min(
        ...actorCandidates.map((layer) => layerOrder.get(layer.id) ?? Number.POSITIVE_INFINITY),
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
      this.#objectSprites.set(object.id, sprite);
      const feetY = sprite.y + (1 - sprite.originY) * sprite.displayHeight;
      // The tie-break stays below the actor's half-step slot, however many objects the map has.
      sprite.setDepth(feetY + (index / (objects.length + 1)) * 0.25);
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
  #drawTile(draw: TileDraw): Phaser.GameObjects.Image {
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
    return sprite;
  }

  #bindInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      // The keys are added without capture: Phaser then leaves the page's own fields and buttons their keys (GAME-09).
      // Only #onKeyDown prevents the browser's default, and only while the game runs.
      const key = (code: number) => keyboard.addKey(code, false);
      this.#arrows = {
        left: key(Phaser.Input.Keyboard.KeyCodes.LEFT),
        right: key(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        up: key(Phaser.Input.Keyboard.KeyCodes.UP),
        down: key(Phaser.Input.Keyboard.KeyCodes.DOWN),
      };
      this.#wasd = {
        W: key(Phaser.Input.Keyboard.KeyCodes.W),
        A: key(Phaser.Input.Keyboard.KeyCodes.A),
        S: key(Phaser.Input.Keyboard.KeyCodes.S),
        D: key(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.#activateKeys = [
        key(Phaser.Input.Keyboard.KeyCodes.ENTER),
        key(Phaser.Input.Keyboard.KeyCodes.SPACE),
      ];
    }
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.#onTap);
    window.addEventListener("keydown", this.#onKeyDown);
    window.addEventListener("keyup", this.#onKeyUp);
  }

  /** The arrow keys, and W A S D, as they are held; none while a field or button of the page has the focus. */
  #keys(): { left: boolean; right: boolean; up: boolean; down: boolean } {
    if (isTypingTarget(document.activeElement)) {
      return { left: false, right: false, up: false, down: false };
    }
    const arrows = this.#arrows;
    const wasd = this.#wasd;
    return {
      left: arrows?.left.isDown === true || wasd?.A.isDown === true,
      right: arrows?.right.isDown === true || wasd?.D.isDown === true,
      up: arrows?.up.isDown === true || wasd?.W.isDown === true,
      down: arrows?.down.isDown === true || wasd?.S.isDown === true,
    };
  }

  /** Tap-to-move (GAME-10): walks around the blocked shapes to the tapped point, or into a portal. */
  #tapTo(point: Point): void {
    const map = this.#map;
    if (map === undefined) return;
    const size = map.size;
    const portal = portalAt(map, point);
    // A tap on a clickable object walks to its approach point, where its action runs (GAME-16).
    const area = portal === undefined ? clickableAt(map, point) : undefined;
    this.#pending = undefined;
    if (area !== undefined) {
      this.#walkToObject(map, area);
      return;
    }
    const { grid } = this.#navigationOf(map);
    const start = startCells(map, grid, this.#position);
    if (portal !== undefined) {
      const goal = interiorPoint(portal.polygon);
      const cells = findPath(grid, start, cellOf(goal, size));
      if (cells === undefined) return;
      const route = walkRoute(map, this.#position, cells, goal);
      if (route !== undefined) this.#path = route;
      return;
    }
    const reachable = this.#reachableFrom(map, start);
    const goal = cellOf(point, size);
    const free = walkable(map.obstacles, playerCollisionEllipse(point, size.width));
    // A free point in a reachable cell: the walk of old. (The set of reachable cells spares a search that cannot
    // succeed, which would take the longest.)
    const cells = free && reachable.has(cellKey(goal)) ? findPath(grid, start, goal) : undefined;
    if (cells !== undefined) {
      // The walk ends where the player tapped, not at the centre of that cell.
      this.#path = routeToPoint(map, this.#position, cells, point);
      return;
    }
    // A blocked point, or one that cannot be reached: the nearest reachable point nearby, or nothing (GAME-23). The
    // path leads to the reachable cell the point was found from; the point itself may lie in a cell whose centre is
    // blocked, which no path leads to.
    const target = nearestReachablePoint(map, reachable, point);
    if (target === undefined) return;
    const toCell = findPath(grid, start, target.cell);
    if (toCell === undefined) return;
    const route = walkRoute(map, this.#position, toCell, target.point);
    if (route !== undefined) this.#path = route;
  }

  /** The navigation grid of a map, built once while the player taps on it. */
  #navigationOf(map: ParsedMap): MapNavigation {
    if (this.#navigation?.map !== map) {
      this.#navigation = { map, grid: navigationGrid(map), reachable: new Map() };
    }
    return this.#navigation;
  }

  /** The cells that a path leads to from a start cell, worked out once per start cell (GAME-23). */
  #reachableFrom(map: ParsedMap, start: readonly Cell[]): ReadonlySet<string> {
    const navigation = this.#navigationOf(map);
    const key = start.map(cellKey).join(";");
    let reachable = navigation.reachable.get(key);
    if (reachable === undefined) {
      reachable = reachableCells(navigation.grid, start);
      navigation.reachable.set(key, reachable);
    }
    return reachable;
  }

  /** Walks to the approach point of an object; stands already there, the action runs at once. */
  #walkToObject(map: ParsedMap, area: ClickableArea): void {
    if (arrivedAt(map, area, this.#position)) {
      this.#path = [];
      this.#activate(area);
      return;
    }
    const size = map.size;
    const grid = this.#navigationOf(map).grid;
    const cells = findPath(
      grid,
      startCells(map, grid, this.#position),
      cellOf(area.approach, size),
    );
    if (cells === undefined) return;
    const route = walkRoute(map, this.#position, cells, area.approach);
    if (route === undefined) return;
    this.#path = route;
    this.#pending = area;
  }

  /** Ends a walk where it is: its path and the object it was walking to (GAME-10). */
  #stopWalk(): void {
    this.#path = [];
    this.#pending = undefined;
    this.#walkWatch.reset();
  }

  /** Runs the action of an object through the host (GAME-06); an object without an action does nothing. */
  #activate(area: ClickableArea): void {
    const world = this.#world;
    const map = this.#map;
    if (world === undefined || map === undefined) return;
    const action = actionOf(world.actions, map.id, area);
    if (action.kind === "none") return;
    this.#host?.onActivate?.({
      mapId: map.id,
      object: area.name,
      ...(area.label === undefined ? {} : { label: area.label }),
      action,
    });
  }

  /**
   * The arrow of each portal floats smoothly up and down, again and again, like a boat on waves, above a shadow
   * on the ground that shrinks and fades while the arrow rises (GAME-15).
   */
  #floatPortals(map: ParsedMap): void {
    // The arrow hovers above the ground, so its shadow shows below it, and rises and sinks by the amplitude.
    const HOVER = 6;
    /** Above the foreground layers (at most about 1,100,000), below the effects of the objects (1,500,000). */
    const PORTAL_ARROW_DEPTH = 1_200_000;
    const AMPLITUDE = 4;
    for (const portal of map.portals) {
      const sprite = this.#objectSprites.get(portal.objectId);
      if (sprite === undefined) continue;
      const bounds = sprite.getBounds();
      const shadow = this.add
        .ellipse(
          bounds.centerX,
          bounds.bottom - bounds.height * 0.15,
          bounds.width * 0.6,
          bounds.height * 0.3,
          0x000000,
          0.3,
        )
        .setDepth(sprite.depth - 0.5);
      // The arrow floats above the world: nothing in it, no prop and no foreground layer, covers it. Its shadow
      // keeps the depth of the ground it lies on, so a figure in front still stands over the shadow.
      sprite.setDepth(PORTAL_ARROW_DEPTH);
      const base = sprite.y - HOVER;
      // A warm glow around the arrow's own pixels, which breathes with the float.
      sprite.enableFilters();
      const glow = sprite.filters?.internal.addGlow(0xffd36b, 3, 0, 0.8);
      // Without this, a glow is cut off at the picture's own bounds.
      glow?.setPaddingOverride(null);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1500,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
        onUpdate: (tween) => {
          const rise = tween.getValue() ?? 0;
          sprite.y = base - AMPLITUDE * rise;
          shadow.setScale(1 - 0.25 * rise);
          shadow.setAlpha(1 - 0.4 * rise);
          if (glow) glow.outerStrength = 2 + 3 * rise;
        },
      });
    }
  }

  /**
   * Small sparkles appear at random points along the edges of the clickable objects, a few at a time (GAME-15).
   * Easter eggs do not sparkle (GAME-08).
   */
  #startSparkles(map: ParsedMap): void {
    // Only objects with a picture sparkle, and only on the opaque pixels of that picture: a shape without one has
    // nothing visible to sparkle on.
    for (const area of map.clickables) if (!area.hidden) this.#readEdge(area);
    const visible = map.clickables.filter((area) => this.#edges.has(area.name));
    if (visible.length === 0) return;
    const schedule = (): void => {
      this.#sparkleTimer = this.time.delayedCall(nextSparkleDelay(), () => {
        const area = visible[Math.floor(Math.random() * visible.length)];
        if (area !== undefined && this.#activeSparkles < MAX_SPARKLES) this.#sparkle(area);
        schedule();
      });
    };
    schedule();
  }

  /**
   * The visible edge of a tile object's picture, read once from its pixels: sparkles must not appear on the
   * transparent pixels of its image, and they sit where the picture is drawn (GAME-15). A picture that cannot be
   * read has no edge, and the object does not sparkle.
   */
  #readEdge(area: ClickableArea): void {
    const source = area.objectId === undefined ? undefined : this.#objectSprites.get(area.objectId);
    if (source === undefined) return;
    try {
      const key = source.texture.key;
      const frame = source.frame.name;
      const edge = visibleEdge(
        (x, y) => this.textures.getPixelAlpha(x, y, key, frame),
        source.frame.width,
        source.frame.height,
      );
      // Where the picture is drawn: the top left of the sprite, as Phaser places it (origin, scale and all).
      const topLeft = source.getTopLeft();
      const left = topLeft.x;
      const top = topLeft.y;
      const scaleX = source.displayWidth / source.frame.width;
      const scaleY = source.displayHeight / source.frame.height;
      if (edge.length > 0) {
        this.#edges.set(
          area.name,
          edge.map((point) => ({ x: left + point.x * scaleX, y: top + point.y * scaleY })),
        );
      }
    } catch {
      // The pixels cannot be read: the object does not sparkle.
    }
  }

  #sparkle(area: ClickableArea): void {
    const edge = this.#edges.get(area.name);
    const at = edge?.[Math.floor(Math.random() * edge.length)];
    if (at === undefined) return;
    const radius = 1.5 + Math.random() * 1.5;
    const star = this.add.graphics({ x: at.x, y: at.y }).setDepth(1_500_000);
    star.fillStyle(0xfff3a0, 1);
    star.fillPoints(
      [
        { x: 0, y: -radius },
        { x: radius * 0.25, y: -radius * 0.25 },
        { x: radius, y: 0 },
        { x: radius * 0.25, y: radius * 0.25 },
        { x: 0, y: radius },
        { x: -radius * 0.25, y: radius * 0.25 },
        { x: -radius, y: 0 },
        { x: -radius * 0.25, y: -radius * 0.25 },
      ].map(({ x, y }) => new Phaser.Math.Vector2(x, y)),
      true,
    );
    this.#sparkles += 1;
    this.#activeSparkles += 1;
    this.tweens.add({
      targets: star,
      alpha: 0,
      scale: 1.8,
      angle: 45,
      duration: 450 + Math.random() * 300,
      onComplete: () => {
        star.destroy();
        this.#activeSparkles -= 1;
      },
    });
  }

  /** Now and then a shine sweeps once over one clickable object that has a picture (GAME-15, GAME-08). */
  #startShines(map: ParsedMap): void {
    const visible = map.clickables.filter(
      (area) =>
        !area.hidden && area.objectId !== undefined && this.#objectSprites.has(area.objectId),
    );
    if (visible.length === 0) return;
    const schedule = (): void => {
      this.#shineTimer = this.time.delayedCall(nextShineDelay(), () => {
        const area = visible[Math.floor(Math.random() * visible.length)];
        if (area !== undefined) this.#shine(area);
        schedule();
      });
    };
    schedule();
  }

  /**
   * A diagonal band of light moves through the object's picture. The light is painted into a canvas of the
   * picture's size with the picture itself as the stencil (`source-in`), so it shows only on the picture's opaque
   * pixels; the canvas is drawn over the object, and nothing else is touched. An object without a picture has
   * no shine: there are no pixels of its own to light.
   */
  #shine(area: ClickableArea): void {
    const DURATION = 800;
    const source = area.objectId === undefined ? undefined : this.#objectSprites.get(area.objectId);
    if (source === undefined) return;
    const frame = source.frame;
    const image = source.texture.getSourceImage(frame.name) as CanvasImageSource;
    const width = frame.cutWidth;
    const height = frame.cutHeight;
    this.#shines += 1;
    const key = `shine:${String(this.#shines)}`;
    const canvas = this.textures.createCanvas(key, width, height);
    if (canvas === null) return;
    this.#shineKeys.add(key);
    const context = canvas.getContext();
    const copy = this.add
      .sprite(source.x, source.y, key)
      .setOrigin(source.originX, source.originY)
      .setDisplaySize(source.displayWidth, source.displayHeight)
      .setDepth(source.depth + 0.0005)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: DURATION,
      ease: "Sine.easeInOut",
      onUpdate: (tween) => {
        const line = shineGradient(width, height, tween.getValue() ?? 0);
        const gradient = context.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.7)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = "source-over";
        context.drawImage(image, frame.cutX, frame.cutY, width, height, 0, 0, width, height);
        context.globalCompositeOperation = "source-in";
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = "source-over";
        canvas.refresh();
      },
      onComplete: () => {
        copy.destroy();
        this.#shineKeys.delete(key);
        this.textures.remove(key);
      },
    });
  }

  /** Removes the shine textures a map change left behind, when the scene shuts down (GAME-15). */
  #removeShines(): void {
    for (const key of this.#shineKeys) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    this.#shineKeys.clear();
  }

  /** Whether a tap is on the player's own avatar, not on the world around it (GAME-18). */
  #ownAvatarHit(point: Point): boolean {
    const player = this.#player;
    return player !== undefined && onAvatar(point, player);
  }

  /** Stops the game while a page is open above it, and lets the keys reach the page (GAME-11). */
  setPaused(paused: boolean): void {
    const keyboard = this.input.keyboard;
    if (paused) {
      this.scene.pause();
      keyboard?.resetKeys();
      return;
    }
    // An activation key still held when the page closes (Enter on its close button) must not open an object again.
    this.#activationBlocked = this.#activateKeys.some((key) => key.isDown);
    this.scene.resume();
    keyboard?.resetKeys();
  }

  /** The clickable objects of the map the player is in, for the test hook and the host. */
  clickables(): {
    name: string;
    x: number;
    y: number;
    ax: number;
    ay: number;
    hidden: boolean;
    /** Whether Enter would activate this object now: the one the avatar's reach picks (GAME-06). */
    reachable: boolean;
  }[] {
    const map = this.#map;
    const inReach = map === undefined ? undefined : clickableInReach(map, this.#position)?.name;
    return (map?.clickables ?? []).map((area) => {
      const centre = polygonCentre(area.polygon);
      return {
        name: area.name,
        x: centre.x,
        y: centre.y,
        ax: area.approach.x,
        ay: area.approach.y,
        hidden: area.hidden,
        reachable: area.name === inReach,
      };
    });
  }

  #transition(mapId: string, spawn: string | undefined): void {
    this.#transitioning = true;
    this.scene.restart({ mapId, spawn: spawn ?? "start" });
  }
}
