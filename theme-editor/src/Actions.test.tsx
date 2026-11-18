import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import { memoryStore } from "./draftStore.ts";
import { newDraft } from "./model.ts";
import type { PackageData } from "./transfer.ts";

const downloads: string[] = [];

beforeEach(() => {
  downloads.length = 0;
  URL.createObjectURL = () => "blob:download";
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const name = () => screen.getByLabelText<HTMLInputElement>("Name of the theme package");
const hex = (label: string) => screen.getByLabelText<HTMLInputElement>(`${label} (#rrggbb)`);
const saved = () => screen.findByText("Draft saved in this browser");

describe("theme package editor: the draft survives a reload (THM-14)", () => {
  it("[THM-14] the work is saved and comes back in a new session on the same store", async () => {
    const store = memoryStore();
    const first = render(<App store={store} />);
    await saved();
    fireEvent.change(name(), { target: { value: "Sommerfest" } });
    fireEvent.change(hex("accent"), { target: { value: "#7a3b2e" } });
    await screen.findByText("Saving the draft …");
    await saved();
    first.unmount();

    render(<App store={store} />);
    await vi.waitFor(() => {
      expect(name().value).toBe("Sommerfest");
    });
    expect(hex("accent").value).toBe("#7a3b2e");
  });

  it("[THM-14] an empty start does not overwrite the stored draft before it is loaded", async () => {
    const store = memoryStore();
    await store.save({ ...newDraft(), name: "Kept" });
    const save = vi.spyOn(store, "save");
    render(<App store={store} />);
    await vi.waitFor(() => {
      expect(name().value).toBe("Kept");
    });
    await saved();
    expect(save.mock.calls.every(([draft]) => draft.name === "Kept")).toBe(true);
  });

  it("[THM-14] «New theme» asks for a second click, then starts from the platform's colours and forgets the draft", async () => {
    const store = memoryStore();
    render(<App store={store} />);
    await saved();
    fireEvent.change(name(), { target: { value: "Sommerfest" } });
    fireEvent.change(hex("accent"), { target: { value: "#7a3b2e" } });
    fireEvent.click(screen.getByRole("button", { name: "New theme" }));
    expect(name().value).toBe("Sommerfest"); // nothing happens on the first click
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(name().value).toBe("Sommerfest");
    fireEvent.click(screen.getByRole("button", { name: "New theme" }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, discard/ }));
    expect(name().value).toBe("");
    expect(hex("accent").value).toBe("#2a2a28");
    await vi.waitFor(() =>
      store.load().then((stored) => {
        expect(stored?.name).toBe("");
      }),
    );
  });
});

const packageData = (): PackageData => ({
  name: "Opened",
  colors: { ...newDraft().colors, accent: "#2f6b4f" },
  waiting: { card: "#fdfbf6", text: "#2b2a26", button: "#2f6b4f", onButton: "#ffffff" },
  fonts: {
    body: {
      family: "Lora",
      sizeAdjust: 112,
      files: [{ fileName: "lora.woff2", weight: 400, style: "normal", woff2: "AAEC" }],
    },
    heading: null,
    display: null,
  },
  icons: { "icon-192": "iVBORw0KGgo=" },
});

describe("theme package editor: export (THM-12)", () => {
  it("[THM-12] sends the draft to the server and downloads the package under its file name", async () => {
    const sent: [string, RequestInit][] = [];
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      sent.push([url, init]);
      return Promise.resolve({
        ok: true,
        headers: { get: () => "sommerfest.tar.gz" },
        blob: () => Promise.resolve(new Blob(["archive"])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App store={memoryStore()} />);
    await saved();
    fireEvent.change(name(), { target: { value: "Sommerfest" } });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await screen.findByText(/sommerfest\.tar\.gz was checked by the platform's validator/);
    expect(downloads).toEqual(["sommerfest.tar.gz"]);
    const [url, init] = sent[0] ?? ["", {}];
    expect(url).toBe("/__theme-editor/api/export");
    const data = JSON.parse(init.body as string) as PackageData;
    expect(data.name).toBe("Sommerfest");
    expect(data.waiting).toBeNull();
    expect(data.colors.background).toBe("#f4f4f1");
  });

  it("[THM-12] a package that the validator refuses is not downloaded, and its findings show their cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              message: "The validator refuses the package",
              findings: [
                {
                  file: "theme.json",
                  code: "contrast",
                  detail: "«text» on «surface»: 3.1 : 1 (at least 4.5 : 1)",
                },
                { file: "fonts/lora.woff2", code: "font_too_large", detail: "larger than 2 MB" },
                {
                  file: "icons/icon-192.png",
                  code: "icon_size",
                  detail: "200 × 200 instead of 192 × 192",
                },
                { file: "manifest.json", code: "json_field", detail: "name: too small" },
              ],
            }),
        }),
      ),
    );
    render(<App store={memoryStore()} />);
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const panel = await screen.findByRole("alert");
    expect(within(panel).getByText("The theme was not exported")).toBeTruthy();
    const items = within(panel)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "Colours · theme.json: «text» on «surface»: 3.1 : 1 (at least 4.5 : 1)",
      "Fonts · fonts/lora.woff2: larger than 2 MB",
      "Icons · icons/icon-192.png: 200 × 200 instead of 192 × 192",
      "Name · manifest.json: name: too small",
    ]);
    expect(downloads).toEqual([]);
  });

  it("[THM-12] says so when the development server does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(<App store={memoryStore()} />);
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/did not answer/);
    expect(downloads).toEqual([]);
  });
});

describe("theme package editor: open (THM-13)", () => {
  const archive = () => new File(["archive"], "opened.tar.gz", { type: "application/gzip" });

  it("[THM-13] an existing package is validated and fills the fields, the fonts and the icons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ data: packageData() }) }),
      ),
    );
    render(<App store={memoryStore()} />);
    await saved();
    fireEvent.change(screen.getByLabelText("Open package"), { target: { files: [archive()] } });
    await screen.findByText(/opened\.tar\.gz was checked and filled in/);
    expect(name().value).toBe("Opened");
    expect(hex("accent").value).toBe("#2f6b4f");
    expect(screen.getByLabelText<HTMLInputElement>("waiting card (#rrggbb)").value).toBe("#fdfbf6");
    expect(screen.getByLabelText<HTMLInputElement>("Body family").value).toBe("Lora");
    expect(screen.getByLabelText<HTMLInputElement>("Body size adjust in percent").value).toBe(
      "112",
    );
    expect(screen.getByText("lora.woff2")).toBeTruthy();
    expect(screen.getAllByAltText("icon-192 icon").length).toBeGreaterThan(0);
    // and it can be changed from there
    fireEvent.change(name(), { target: { value: "Opened and changed" } });
    expect(name().value).toBe("Opened and changed");
  });

  it("[THM-13] a refused package shows its findings and is not opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              message: "The validator refuses the package",
              findings: [
                { file: "(archive)", code: "archive_invalid", detail: "not a gzip archive" },
              ],
            }),
        }),
      ),
    );
    render(<App store={memoryStore()} />);
    await saved();
    fireEvent.change(name(), { target: { value: "Mine" } });
    fireEvent.change(screen.getByLabelText("Open package"), { target: { files: [archive()] } });
    const panel = await screen.findByRole("alert");
    expect(within(panel).getByText("opened.tar.gz was not opened")).toBeTruthy();
    expect(within(panel).getByRole("listitem").textContent).toBe(
      "Package · (archive): not a gzip archive",
    );
    expect(name().value).toBe("Mine");
  });
});
