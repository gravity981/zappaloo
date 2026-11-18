import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hex = (label: string) => screen.getByLabelText<HTMLInputElement>(`${label} (#rrggbb)`);
const contrastCard = () => screen.getByRole("region", { name: "Contrast check" });

describe("theme package editor: name and colours (THM-09)", () => {
  it("[THM-09] shows the editor's title and starts from the platform's default colours", () => {
    render(<App />);
    expect(screen.getByText("Theme package editor")).toBeTruthy();
    expect(hex("background").value).toBe("#f4f4f1");
    expect(hex("accent").value).toBe("#2a2a28");
  });

  it("[THM-09] takes the name, at most 60 characters", () => {
    render(<App />);
    const name = screen.getByLabelText<HTMLInputElement>("Name of the theme package");
    fireEvent.change(name, { target: { value: "Sommerfest" } });
    expect(name.value).toBe("Sommerfest");
    expect(name.maxLength).toBe(60);
  });

  it("[THM-09] updates the contrast check while a colour is typed, with the validator's limit", () => {
    render(<App />);
    expect(within(contrastCard()).getAllByText(/✓/)).toHaveLength(3);
    fireEvent.change(hex("text"), { target: { value: "#9a9486" } });
    // text on background and on surface now fail; onAccent on accent still passes
    expect(within(contrastCard()).getAllByText(/✗/)).toHaveLength(2);
    expect(within(contrastCard()).getAllByText(/✓/)).toHaveLength(1);
    // a half-typed colour leaves the check out instead of showing a wrong ratio
    fireEvent.change(hex("text"), { target: { value: "#9a94" } });
    expect(within(contrastCard()).getByText(/Waiting for complete colours/)).toBeTruthy();
    expect(hex("text").getAttribute("aria-invalid")).toBe("true");
  });

  it("[THM-09] the colour picker and the field change the same colour", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("accent (picker)"), { target: { value: "#7a3b2e" } });
    expect(hex("accent").value).toBe("#7a3b2e");
  });

  it("[THM-09] checks the waiting card's two pairs only with its own colours switched on", () => {
    render(<App />);
    expect(screen.queryByLabelText("waiting card (#rrggbb)")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Own waiting card colours" }));
    expect(screen.getByLabelText("waiting card (#rrggbb)")).toBeTruthy();
    expect(within(contrastCard()).getByText("onButton on waiting button")).toBeTruthy();
    expect(within(contrastCard()).getAllByText(/[✓✗]/)).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("waiting button (#rrggbb)"), {
      target: { value: "#fffaf0" },
    });
    expect(within(contrastCard()).getAllByText(/✗/)).toHaveLength(1);
  });
});

function fontResponse(fileName: string, family: string, converted: boolean) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        fileName,
        converted,
        size: 90_000,
        woff2: btoa("wOF2....."),
        suggestion: { family, weight: 700, style: "italic" },
      }),
  };
}

describe("theme package editor: fonts (THM-09)", () => {
  it("[THM-09] a font file is converted by the server, and family, weight and style are suggested", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(fontResponse("Lora-Bold.woff2", "Lora", true)));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.click(screen.getByRole("switch", { name: "Body font" }));
    fireEvent.change(screen.getByLabelText("Add Body font file"), {
      target: { files: [new File(["x"], "Lora-Bold.ttf")] },
    });
    await screen.findByText("Lora-Bold.woff2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText<HTMLInputElement>("Body family").value).toBe("Lora");
    expect(screen.getByLabelText<HTMLSelectElement>("Lora-Bold.woff2 weight").value).toBe("700");
    expect(screen.getByLabelText<HTMLSelectElement>("Lora-Bold.woff2 style").value).toBe("italic");
    expect(screen.getByText(/converted · 88 KB/)).toBeTruthy();
    expect(screen.getByText("1 of 8 files")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Lora-Bold.woff2" }));
    expect(screen.queryByText("Lora-Bold.woff2")).toBeNull();
    expect(screen.getByText("0 of 8 files")).toBeTruthy();
  });

  it("[THM-09] changes made while a font is being converted are kept when the font arrives", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const slowFetch = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", slowFetch);
    render(<App />);
    fireEvent.click(screen.getByRole("switch", { name: "Body font" }));
    fireEvent.change(screen.getByLabelText("Add Body font file"), {
      target: { files: [new File(["x"], "Lora-Bold.otf")] },
    });
    await vi.waitFor(() => {
      expect(slowFetch).toHaveBeenCalled();
    });
    // the conversion takes a while: the colours, the name and the waiting card change meanwhile
    fireEvent.change(hex("accent"), { target: { value: "#7a3b2e" } });
    fireEvent.change(screen.getByLabelText("Name of the theme package"), {
      target: { value: "Sommerfest" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Own waiting card colours" }));
    finish(fontResponse("Lora-Bold.woff2", "Lora", true));
    await screen.findByText("Lora-Bold.woff2");
    expect(hex("accent").value).toBe("#7a3b2e");
    expect(screen.getByLabelText<HTMLInputElement>("Name of the theme package").value).toBe(
      "Sommerfest",
    );
    expect(screen.getByLabelText("waiting card (#rrggbb)")).toBeTruthy();
  });

  it("[THM-09] a refused font shows the validator's finding and is not added", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              message: "larger than 2 MB",
              findings: [
                { file: "fonts/big.woff2", code: "font_too_large", detail: "larger than 2 MB" },
              ],
            }),
        }),
      ),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("switch", { name: "Heading font" }));
    fireEvent.change(screen.getByLabelText("Add Heading font file"), {
      target: { files: [new File(["x"], "big.ttf")] },
    });
    expect((await screen.findByRole("alert")).textContent).toBe("big.ttf: larger than 2 MB");
    expect(screen.getByText("0 of 8 files")).toBeTruthy();
  });

  it("[THM-09] at most 4 files per font and 8 in all", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(fontResponse(`f${String(++n)}.woff2`, "Fam", false))),
    );
    render(<App />);
    const files = (count: number) =>
      Array.from({ length: count }, (_, i) => new File(["x"], `a${String(i)}.otf`));
    fireEvent.click(screen.getByRole("switch", { name: "Body font" }));
    fireEvent.change(screen.getByLabelText("Add Body font file"), { target: { files: files(5) } });
    await screen.findByText("4 of 8 files");
    expect(screen.getByRole("alert").textContent).toMatch(/at most 4 files and a theme at most 8/);
    fireEvent.click(screen.getByRole("switch", { name: "Heading font" }));
    fireEvent.change(screen.getByLabelText("Add Heading font file"), {
      target: { files: files(4) },
    });
    await screen.findByText("8 of 8 files");
    fireEvent.click(screen.getByRole("switch", { name: "Display font" }));
    expect(screen.getByLabelText<HTMLInputElement>("Add Display font file").disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("Add Body font file").disabled).toBe(true);
  });

  it("[THM-09] a family that the package would refuse is marked", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("switch", { name: "Display font" }));
    const family = screen.getByLabelText("Display family");
    fireEvent.change(family, { target: { value: "Bad/Family" } });
    expect(family.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(family, { target: { value: "Cormorant Garamond" } });
    expect(family.getAttribute("aria-invalid")).toBe("false");
  });
});
