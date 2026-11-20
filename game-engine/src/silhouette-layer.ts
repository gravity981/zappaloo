// The silhouettes of figures behind objects (GAME-42), drawn above the objects and below the weather: the part of
// the game that needs Phaser. The arithmetic is in silhouette.ts.
import Phaser from "phaser";
import type { Point } from "./geometry.ts";
import {
  type Cover,
  CoverIndex,
  coveredShare,
  ellipsePoints,
  opaquePoints,
  SILHOUETTE_OPACITY,
  type SilhouetteRule,
  silhouetteShows,
} from "./silhouette.ts";

/** The depth of the target marker (GAME-24): above the ground layers and below objects and figures. */
export const MARKER_DEPTH = -1;

/** Above the foreground layers and the clouds' neighbours (portal arrows, shines), below the cloud shadows and the fog. */
export const SILHOUETTE_DEPTH = 1_600_000;

/** The opacity of every pixel of a frame, read once: asking the canvas for a single pixel is slow, most of all on a phone. */
interface AlphaMask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export class AlphaMasks {
  readonly #masks = new Map<string, AlphaMask | null>();
  readonly #scene: Phaser.Scene;
  #canvas: HTMLCanvasElement | undefined;

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
  }

  /** The alpha (0 – 255) at a pixel of a frame; 0 outside it or when the frame cannot be read. */
  alpha(key: string, frame: string | undefined, x: number, y: number): number {
    const mask = this.#maskOf(key, frame);
    if (mask === null || x < 0 || y < 0 || x >= mask.width || y >= mask.height) return 0;
    return mask.data[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3] ?? 0;
  }

  size(key: string, frame: string | undefined): { width: number; height: number } | undefined {
    const mask = this.#maskOf(key, frame);
    return mask === null ? undefined : { width: mask.width, height: mask.height };
  }

  #maskOf(key: string, frameName: string | undefined): AlphaMask | null {
    const id = `${key}|${frameName ?? ""}`;
    const known = this.#masks.get(id);
    if (known !== undefined) return known;
    const mask = this.#read(key, frameName);
    this.#masks.set(id, mask);
    return mask;
  }

  #read(key: string, frameName: string | undefined): AlphaMask | null {
    const textures = this.#scene.textures;
    if (!textures.exists(key)) return null;
    const texture = textures.get(key);
    const frame = texture.get(frameName);
    const source = texture.getSourceImage(frame.name);
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return null;
    const canvas = (this.#canvas ??= document.createElement("canvas"));
    canvas.width = frame.cutWidth;
    canvas.height = frame.cutHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return null;
    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        source,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        0,
        0,
        frame.cutWidth,
        frame.cutHeight,
      );
      const { data } = context.getImageData(0, 0, frame.cutWidth, frame.cutHeight);
      return { width: frame.cutWidth, height: frame.cutHeight, data: new Uint8ClampedArray(data) };
    } catch {
      // A picture the canvas may not read (a foreign origin) cannot be measured; it covers nothing.
      return null;
    }
  }
}

/** A drawn picture of the map (a tile object) as something that covers figures. */
export function coverOfPicture(
  picture: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  masks: AlphaMasks,
): Cover {
  const width = picture.displayWidth;
  const height = picture.displayHeight;
  const x = picture.x - picture.originX * width;
  const y = picture.y - picture.originY * height;
  return {
    bounds: { x, y, width, height },
    depth: picture.depth,
    // The picture may change its frame (an animated object, GAME-35), so the pixel is read from what it shows now.
    opaqueAt: (px, py) =>
      masks.alpha(
        picture.texture.key,
        picture.frame.name,
        (px - x) / picture.scaleX,
        (py - y) / picture.scaleY,
      ) >= OPAQUE,
  };
}

/** Every tile of a tile layer as something that covers figures: its picture where Phaser draws it. */
export function coversOfTileLayer(layer: Phaser.Tilemaps.TilemapLayer, masks: AlphaMasks): Cover[] {
  const covers: Cover[] = [];
  layer.forEachTile((tile) => {
    if (tile.index < 0) return;
    const tileset = layer.gidMap[tile.index];
    const coords = tileset?.getTileTextureCoordinates(tile.index) as Point | null | undefined;
    const image = tileset?.image;
    if (tileset === undefined || coords === null || coords === undefined || !image) return;
    // As the renderer places it: the cell's corner, moved by the tileset's offset (TransformerTile).
    const x = layer.x + tile.pixelX - tileset.tileOffset.x;
    const y = layer.y + tile.pixelY - tileset.tileOffset.y;
    covers.push({
      bounds: { x, y, width: tileset.tileWidth, height: tileset.tileHeight },
      depth: layer.depth,
      opaqueAt: (px, py) =>
        masks.alpha(image.key, undefined, coords.x + (px - x), coords.y + (py - y)) >= OPAQUE,
    });
  });
  return covers;
}

/** A pixel counts as part of a picture from this alpha on. */
const OPAQUE = 32;

export interface MarkerShape {
  centre: Point;
  radiusX: number;
  radiusY: number;
  scale: number;
  alpha: number;
}

/** The silhouettes of the figures and of the target marker of one map. */
export class SilhouetteLayer {
  readonly #scene: Phaser.Scene;
  readonly #color: number;
  readonly #masks: AlphaMasks;
  readonly #covers: CoverIndex;
  readonly #rule: SilhouetteRule;
  readonly #shapes = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite>();
  readonly #points = new Map<string, Point[]>();
  #ring: Phaser.GameObjects.Ellipse | undefined;

  constructor(
    scene: Phaser.Scene,
    color: number,
    masks: AlphaMasks,
    covers: readonly Cover[],
    rule: SilhouetteRule = "mostly",
  ) {
    this.#scene = scene;
    this.#color = color;
    this.#masks = masks;
    this.#covers = new CoverIndex(covers);
    this.#rule = rule;
  }

  /** Which silhouettes show now: the player's, how many figures' in all, and the marker's (test hook, GAME-42). */
  state(player: Phaser.GameObjects.Sprite | undefined): {
    player: boolean;
    figures: number;
    marker: boolean;
  } {
    const shown = [...this.#shapes.values()].filter((shape) => shape.visible).length;
    return {
      player: player !== undefined && this.#shapes.get(player)?.visible === true,
      figures: shown,
      marker: this.#ring?.visible === true,
    };
  }

  /** Shows the silhouette of each figure that is covered enough, and hides the others (GAME-42). */
  update(figures: readonly Phaser.GameObjects.Sprite[], marker?: MarkerShape): void {
    const view = this.#scene.cameras.main.worldView;
    for (const figure of figures) {
      const shape = this.#shapeOf(figure);
      const show =
        figure.active &&
        figure.visible &&
        figure.alpha > 0 &&
        Phaser.Geom.Rectangle.Overlaps(view, figure.getBounds()) &&
        silhouetteShows(
          coveredShare(this.#pointsOf(figure), (point) => this.#covers.covers(point, figure.depth)),
          this.#rule,
        );
      shape.setVisible(show);
      if (!show) continue;
      shape
        .setTexture(figure.texture.key, figure.frame.name)
        .setOrigin(figure.originX, figure.originY)
        .setPosition(figure.x, figure.y)
        .setScale(figure.scaleX, figure.scaleY)
        .setFlipX(figure.flipX);
    }
    this.#updateMarker(marker);
  }

  /** The marker's depth is below every object, so any object over its ring covers it: it shows when any part is covered. */
  #updateMarker(marker: MarkerShape | undefined): void {
    if (marker === undefined) {
      this.#ring?.setVisible(false);
      return;
    }
    const ring = (this.#ring ??= this.#scene.add
      .ellipse(0, 0, marker.radiusX * 2, marker.radiusY * 2)
      .setStrokeStyle(2, this.#color, 1)
      .setDepth(SILHOUETTE_DEPTH));
    const outline = ellipsePoints(
      marker.centre,
      marker.radiusX * marker.scale,
      marker.radiusY * marker.scale,
    );
    // Lower than any figure and object: only what a picture covers.
    const covered = silhouetteShows(
      coveredShare(outline, (point) => this.#covers.covers(point, MARKER_DEPTH)),
      "any",
    );
    ring
      .setVisible(covered)
      .setPosition(marker.centre.x, marker.centre.y)
      .setScale(marker.scale)
      .setAlpha(marker.alpha * SILHOUETTE_OPACITY);
  }

  /** The silhouette of a figure: its picture in one flat colour at half opacity. */
  #shapeOf(figure: Phaser.GameObjects.Sprite): Phaser.GameObjects.Sprite {
    let shape = this.#shapes.get(figure);
    if (shape === undefined) {
      shape = this.#scene.add
        .sprite(0, 0, figure.texture.key, figure.frame.name)
        .setDepth(SILHOUETTE_DEPTH)
        .setAlpha(SILHOUETTE_OPACITY)
        .setTint(this.#color)
        .setTintMode(Phaser.TintModes.FILL)
        .setVisible(false);
      this.#shapes.set(figure, shape);
    }
    return shape;
  }

  /** Points on the opaque pixels of the figure's frame as it stands now, in map pixels. */
  #pointsOf(figure: Phaser.GameObjects.Sprite): Point[] {
    const key = figure.texture.key;
    const frame = figure.frame.name;
    const id = `${key}|${frame}`;
    let points = this.#points.get(id);
    if (points === undefined) {
      const size = this.#masks.size(key, frame);
      points =
        size === undefined
          ? []
          : opaquePoints(size.width, size.height, (x, y) => this.#masks.alpha(key, frame, x, y));
      this.#points.set(id, points);
    }
    const width = figure.displayWidth;
    const left = figure.x - figure.originX * width;
    const top = figure.y - figure.originY * figure.displayHeight;
    return points.map((point) => ({
      x: left + (figure.flipX ? figure.frame.cutWidth - point.x : point.x) * figure.scaleX,
      y: top + point.y * figure.scaleY,
    }));
  }
}
