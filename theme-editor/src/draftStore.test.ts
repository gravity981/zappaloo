// @vitest-environment node
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { indexedDbStore, isStoredDraft, memoryStore } from "./draftStore.ts";
import { newDraft } from "./model.ts";
import type { ThemeDraft } from "./model.ts";

function sampleDraft(): ThemeDraft {
  const draft = newDraft();
  draft.name = "Sommerfest";
  draft.colors.accent = "#7a3b2e";
  draft.waitingEnabled = true;
  draft.fonts.body = {
    family: "Lora",
    files: [
      {
        id: "f1",
        fileName: "lora.woff2",
        weight: 700,
        style: "italic",
        size: 3,
        converted: true,
        woff2: new Uint8Array([1, 2, 3]),
      },
    ],
  };
  draft.icons.files["icon-192"] = { png: new Uint8Array([9, 8, 7]), own: true };
  return draft;
}

describe("the draft kept in the browser (THM-14)", () => {
  it("[THM-14] IndexedDB keeps a draft with its font and icon bytes, and gives it back as it was", async () => {
    const store = indexedDbStore(new IDBFactory());
    expect(await store.load()).toBeNull();
    await store.save(sampleDraft());
    const loaded = await store.load();
    expect(loaded).toEqual(sampleDraft());
    expect(loaded?.fonts.body?.files[0]?.woff2).toBeInstanceOf(Uint8Array);
    expect(Array.from(loaded?.icons.files["icon-192"]?.png ?? [])).toEqual([9, 8, 7]);
  });

  it("[THM-14] it is still there for a store opened later on the same database (a reload)", async () => {
    const factory = new IDBFactory();
    await indexedDbStore(factory).save(sampleDraft());
    expect(await indexedDbStore(factory).load()).toEqual(sampleDraft());
  });

  it("[THM-14] a second save replaces the first, and clearing removes the draft", async () => {
    const store = indexedDbStore(new IDBFactory());
    await store.save(sampleDraft());
    await store.save({ ...sampleDraft(), name: "Winterfest" });
    expect((await store.load())?.name).toBe("Winterfest");
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("[THM-14] a value of another version or shape is not loaded as a draft", () => {
    expect(isStoredDraft({ version: 1, draft: sampleDraft() })).toBe(true);
    expect(isStoredDraft({ version: 2, draft: sampleDraft() })).toBe(false);
    expect(isStoredDraft({ version: 1, draft: { name: "x" } })).toBe(false);
    expect(isStoredDraft(null)).toBe(false);
    expect(isStoredDraft("draft")).toBe(false);
    const withoutFonts = Object.fromEntries(
      Object.entries(sampleDraft()).filter(([key]) => key !== "fonts"),
    );
    expect(isStoredDraft({ version: 1, draft: withoutFonts })).toBe(false);
  });

  it("[THM-14] the in-memory store, for browsers without IndexedDB, keeps a copy", async () => {
    const store = memoryStore();
    const draft = sampleDraft();
    await store.save(draft);
    draft.name = "changed afterwards";
    expect((await store.load())?.name).toBe("Sommerfest");
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
