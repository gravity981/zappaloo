// The built-in door scene of the waiting page (ACS-12): a closed door, slightly ajar, warm
// light through the gap, and small figures behind it carrying a plank, a lantern and a brush.
// Drawn in code at a low resolution and scaled up without smoothing, so it looks like pixel art.
// A tap on the door shows a bigger glimpse for a moment (the easter egg).

/** The height of the scene in its own pixels; the width follows the screen. */
const SCENE_HEIGHT = 180;
const GLIMPSE_MS = 3500;
const GAP = 10;
const GAP_OPEN = 30;
/** The figures walk through the strip behind the gap: from here to the door's right edge. */
const STAGE = 46;

interface Worker {
  x: number;
  speed: number;
  skin: string;
  hair: string;
  clothes: string;
  carry: "plank" | "lantern" | "brush";
}

const WORKERS: Worker[] = [
  { x: 0, speed: 8, skin: "#e0a878", hair: "#4a2e1c", clothes: "#3a6ea5", carry: "plank" },
  { x: 16, speed: 6, skin: "#8a5a3c", hair: "#1c1410", clothes: "#a5433a", carry: "lantern" },
  { x: 32, speed: 7, skin: "#f2c9a0", hair: "#b9852f", clothes: "#4a8a5a", carry: "brush" },
];

export interface Scene {
  /** Draws the scene at time `t` (milliseconds). */
  draw: (t: number) => void;
  /** A tap at a position in CSS pixels of the canvas; true if it opened the glimpse. */
  tap: (x: number, y: number, t: number) => boolean;
}

/** Fits the canvas to its size and returns the scene that draws into it. */
export function createDefaultScene(
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
): Scene | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  let glimpseUntil = 0;
  let gap = GAP;
  let last = 0;
  const motes = Array.from({ length: 12 }, (_, i) => ({
    x: (i * 0.37) % 1,
    y: (i * 0.61) % 1,
    s: 0.4 + ((i * 0.23) % 0.6),
  }));
  const workers = WORKERS.map((worker) => ({ ...worker }));

  /** The scene's pixel layout for the canvas as it is now. */
  function layout() {
    const scale = canvas.height / SCENE_HEIGHT;
    const width = canvas.width / scale;
    const floorY = Math.round(SCENE_HEIGHT * 0.66);
    const doorHeight = Math.round(floorY * 0.72);
    const doorWidth = Math.min(Math.round(doorHeight / 1.6), width * 0.45);
    return {
      scale,
      width,
      doorX: Math.round(width / 2 - doorWidth / 2),
      doorY: floorY - doorHeight,
      doorWidth,
      doorHeight,
      floorY,
    };
  }

  return {
    tap(x, y, t) {
      const l = layout();
      const rect = canvas.getBoundingClientRect();
      const sx = ((x - rect.left) / rect.width) * l.width;
      const sy = ((y - rect.top) / rect.height) * SCENE_HEIGHT;
      const inside =
        sx > l.doorX - 6 && sx < l.doorX + l.doorWidth + 12 && sy > l.doorY && sy < l.floorY;
      if (inside) glimpseUntil = t + GLIMPSE_MS;
      return inside;
    },
    draw(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const l = layout();
      const rect = (color: string, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = color;
        const left = Math.round(x * l.scale);
        const top = Math.round(y * l.scale);
        ctx.fillRect(
          left,
          top,
          Math.round((x + w) * l.scale) - left,
          Math.round((y + h) * l.scale) - top,
        );
      };
      gap += ((t < glimpseUntil ? GAP_OPEN : GAP) - gap) * Math.min(1, dt * 4);
      const { doorX, doorY, doorWidth, doorHeight, floorY } = l;

      // Wall and floor.
      rect("#2d2832", 0, 0, l.width, SCENE_HEIGHT);
      for (let y = 0; y < floorY; y += 8) {
        for (let x = (y / 8) % 2 ? -8 : 0; x < l.width; x += 16) {
          rect((x + y) % 3 ? "#352f3b" : "#3a3340", x + 1, y + 1, 14, 6);
        }
      }
      rect("#24202a", 0, floorY, l.width, SCENE_HEIGHT - floorY);
      for (let x = 0; x < l.width; x += 22) rect("#2a2530", x, floorY + 3, 21, SCENE_HEIGHT);

      // The interior behind the gap: light, a table, and the figures building the world.
      const gapLeft = doorX + doorWidth - gap;
      ctx.save();
      ctx.beginPath();
      ctx.rect(gapLeft * l.scale, doorY * l.scale, gap * l.scale, doorHeight * l.scale);
      ctx.clip();
      rect("#ffd27a", gapLeft, doorY, gap, doorHeight);
      rect("#f6b95c", gapLeft, floorY - 12, gap, 12);
      // Lanterns on a string, and a table in the corner of the room.
      for (let i = 0; i < 3; i += 1)
        rect("#fff0b8", gapLeft + 2 + i * 12, doorY + 10 + (i % 2) * 3, 3, 3);
      rect("#c98a4a", doorX + doorWidth - 22, floorY - 18, 22, 3);
      rect("#c98a4a", doorX + doorWidth - 20, floorY - 15, 2, 15);
      rect("#c98a4a", doorX + doorWidth - 4, floorY - 15, 2, 15);
      const step = Math.floor(t / 220) % 2;
      for (const worker of workers) {
        if (!reducedMotion) {
          worker.x += worker.speed * dt;
          if (worker.x > STAGE) worker.x = -14;
        }
        const x = doorX + doorWidth - STAGE + worker.x;
        const y = floorY - 24;
        rect(worker.hair, x + 2, y, 6, 3);
        rect(worker.skin, x + 2, y + 3, 6, 5);
        rect(worker.clothes, x + 1, y + 8, 8, 9);
        // The legs hang from the body's lower edge (y + 17) and never leave it. A step lifts one
        // foot: that leg is shorter, the other one stands on the floor.
        rect("#2a2228", x + 2, y + 17, 2, step === 0 ? 3 : 5);
        rect("#2a2228", x + 6, y + 17, 2, step === 0 ? 5 : 3);
        if (worker.carry === "plank") rect("#8a5a32", x - 8, y + 11, 26, 3);
        if (worker.carry === "lantern") {
          rect("#ff8c3a", x + 10, y + 8, 4, 6);
          rect("#fff2b0", x + 11, y + 9, 2, 3);
        }
        if (worker.carry === "brush") {
          rect("#8a5a32", x + 10, y + 3, 2, 10);
          rect("#b6483c", x + 9, y, 4, 4);
        }
      }
      ctx.restore();

      // The light on the floor.
      const light = ctx.createLinearGradient(0, floorY * l.scale, 0, canvas.height);
      light.addColorStop(0, "rgba(255,210,122,0.45)");
      light.addColorStop(1, "rgba(255,210,122,0)");
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(gapLeft * l.scale, floorY * l.scale);
      ctx.lineTo((gapLeft + gap) * l.scale, floorY * l.scale);
      ctx.lineTo((gapLeft + gap * 2.6 + 24) * l.scale, canvas.height);
      ctx.lineTo((gapLeft - 10) * l.scale, canvas.height);
      ctx.closePath();
      ctx.fill();
      for (const mote of motes) {
        if (!reducedMotion) {
          mote.y -= dt * 0.03 * mote.s;
          if (mote.y < 0) mote.y = 1;
        }
        rect(
          `rgba(255,230,160,${String(0.5 * mote.s)})`,
          gapLeft - 5 + mote.x * (gap + 30),
          floorY - 20 + mote.y * (SCENE_HEIGHT - floorY + 15),
          1,
          1,
        );
      }

      // Frame and door leaf.
      rect("#4a3a32", doorX - 5, doorY - 6, doorWidth + 10, 6);
      rect("#4a3a32", doorX - 5, doorY, 5, doorHeight);
      rect("#4a3a32", doorX + doorWidth, doorY, 5, doorHeight);
      rect("#7a5638", doorX, doorY, doorWidth - gap, doorHeight);
      for (let i = 1; i < 4; i += 1) {
        rect("#6a4a30", doorX + ((doorWidth - gap) / 4) * i, doorY, 1, doorHeight);
      }
      rect("#5a3e28", doorX, doorY + doorHeight * 0.2, doorWidth - gap, 3);
      rect("#5a3e28", doorX, doorY + doorHeight * 0.75, doorWidth - gap, 3);
      rect("#e8c35a", doorX + doorWidth - gap - 7, doorY + doorHeight * 0.5, 3, 3);
      rect("rgba(255,210,122,0.35)", gapLeft - 1, doorY, 1, doorHeight);

      // The sign: hazard stripes, no text.
      const signX = Math.round(doorX + doorWidth / 2 - 22);
      rect("#e9d7aa", signX, doorY - 24, 44, 11);
      for (let i = 0; i < 6; i += 1) rect("#4a3a32", signX + 3 + i * 7, doorY - 22, 3, 7);
    },
  };
}
