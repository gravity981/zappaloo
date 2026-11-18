import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import { fakePng } from "./test-support.ts";

/** What the stand-in canvas was asked to draw, one entry per icon. */
let drawn: { size: number; filled: string | null }[] = [];

beforeEach(() => {
  drawn = [];
  // jsdom decodes no images and draws nothing: the image decoder and the canvas are stand-ins that
  // keep the dimensions the card reads and the order of the calls.
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn((blob: Blob) =>
      blob.arrayBuffer().then((buffer) => {
        const text = new TextDecoder().decode(new Uint8Array(buffer).subarray(0, 12));
        const [width = 0, height = 0] = text.split("x").map(Number);
        return { width, height, close: () => undefined };
      }),
    ),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const entry = { size: 0, filled: null as string | null };
    drawn.push(entry);
    const context = {
      fillStyle: "",
      fillRect() {
        entry.filled = context.fillStyle;
      },
      drawImage: () => undefined,
    };
    Object.defineProperty(this, "entry", { value: entry });
    return context as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    (this as unknown as { entry: { size: number } }).entry.size = this.width;
    callback(new Blob([fakePng(this.width, this.height)], { type: "image/png" }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** An "image" whose first bytes say its size, which the stand-in decoder reads. */
const image = (width: number, height: number, type = "image/png", name = "logo.png") =>
  new File([`${String(width)}x${String(height)}`], name, { type });
const png = (width: number, height: number, name = "icon.png") =>
  new File([fakePng(width, height)], name, { type: "image/png" });

const choose = (file: File) => {
  fireEvent.change(screen.getByLabelText("Image for the icons"), { target: { files: [file] } });
};
const tile = (name: string) => {
  const found = screen.getByText(name).closest<HTMLElement>(".icon-tile");
  if (found === null) throw new Error(`no tile for ${name}`);
  return found;
};

describe("theme package editor: icons (THM-10)", () => {
  it("[THM-10] starts without icons and asks for a square image", () => {
    render(<App />);
    expect(screen.getByText("Choose a square image")).toBeTruthy();
    expect(screen.getAllByText("none")).toHaveLength(4);
  });

  it("[THM-10] makes the four icons from one square image of at least 512 px", async () => {
    render(<App />);
    choose(image(1024, 1024));
    await screen.findByText(/logo\.png · 1024 × 1024/);
    expect(await screen.findByAltText("icon-512 icon")).toBeTruthy();
    for (const name of ["icon-192", "icon-512", "apple-touch-icon", "icon-maskable-512"]) {
      expect(screen.getByAltText(`${name} icon`)).toBeTruthy();
    }
    expect(drawn.map((entry) => entry.size)).toEqual([192, 512, 180, 512]);
    // only the maskable icon gets a background, in the colour of the accent to start with
    expect(drawn.map((entry) => entry.filled)).toEqual([null, null, null, "#2a2a28"]);
  });

  it("[THM-10] refuses an image that is not square, too small or not PNG or JPEG", async () => {
    render(<App />);
    choose(image(1024, 768));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /must be square \(it is 1024 × 768\)/,
    );
    choose(image(400, 400));
    await screen.findByText(/at least 512 px \(it is 400 × 400\)/);
    choose(image(1024, 1024, "image/gif", "logo.gif"));
    await screen.findByText("logo.gif: use a PNG or JPEG image");
    expect(screen.getAllByText("none")).toHaveLength(4);
  });

  it("[THM-10] a new background makes the maskable icon again and leaves the others alone", async () => {
    render(<App />);
    choose(image(1024, 1024));
    await screen.findByAltText("icon-512 icon");
    drawn.length = 0;
    fireEvent.change(screen.getByLabelText("maskable background (#rrggbb)"), {
      target: { value: "#7a3b2e" },
    });
    await vi.waitFor(() => {
      expect(drawn).toHaveLength(1);
    });
    expect(drawn[0]).toEqual({ size: 512, filled: "#7a3b2e" });
  });

  it("[THM-10] an icon of its own replaces one icon if it has exactly its size", async () => {
    render(<App />);
    choose(image(1024, 1024));
    await screen.findByAltText("icon-192 icon");
    const replace = screen.getByLabelText("Replace icon-192");
    fireEvent.change(replace, { target: { files: [png(200, 200)] } });
    await screen.findByText("icon-192: wrong size (200 × 200 instead of 192 × 192)");
    expect(within(tile("icon-192")).queryByText(/own file/)).toBeNull();
    fireEvent.change(replace, { target: { files: [png(192, 192)] } });
    await vi.waitFor(() => {
      expect(within(tile("icon-192")).getByText(/own file/)).toBeTruthy();
    });
    expect(within(tile("icon-192")).queryByRole("alert")).toBeNull();
  });

  it('[THM-10] another source image keeps the icons of their own; "Use generated" takes them back', async () => {
    render(<App />);
    choose(image(1024, 1024));
    await screen.findByAltText("icon-192 icon");
    fireEvent.change(screen.getByLabelText("Replace icon-192"), {
      target: { files: [png(192, 192)] },
    });
    await screen.findByText(/192 × 192 · own file/);
    drawn.length = 0;
    choose(image(2048, 2048, "image/jpeg", "photo.jpg"));
    await screen.findByText(/photo\.jpg · 2048 × 2048/);
    expect(drawn.map((entry) => entry.size)).toEqual([512, 180, 512]); // not the icon-192
    expect(within(tile("icon-192")).getByText(/own file/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use the generated icon-192" }));
    await vi.waitFor(() => {
      expect(within(tile("icon-192")).queryByText(/own file/)).toBeNull();
    });
  });

  it("[THM-10] the maskable icon is optional and can be removed; the required ones cannot", async () => {
    render(<App />);
    choose(image(1024, 1024));
    await screen.findByAltText("icon-maskable-512 icon");
    expect(screen.queryByRole("button", { name: "Remove icon-192" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove icon-maskable-512" }));
    expect(screen.queryByAltText("icon-maskable-512 icon")).toBeNull();
    expect(screen.getByAltText("icon-512 icon")).toBeTruthy();
  });
});
