// The work in the editor is kept in the browser (IndexedDB) and survives a reload (THM-14). The draft
// is stored as it is: the font and icon bytes are binary, which IndexedDB keeps without conversion.
import { FONT_SLOTS } from "./model.ts";
import type { ThemeDraft } from "./model.ts";

export interface DraftStore {
  load(): Promise<ThemeDraft | null>;
  save(draft: ThemeDraft): Promise<void>;
  clear(): Promise<void>;
}

const DATABASE = "zappaloo-theme-editor";
const STORE = "draft";
const KEY = "current";
/** Raise it when the shape of the draft changes; a draft of another version is not loaded. */
const VERSION = 1;

interface Stored {
  version: number;
  draft: ThemeDraft;
}

/** Whether a stored value is a draft of this version (a stale or foreign value is ignored). */
export function isStoredDraft(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const { version, draft } = value as { version?: unknown; draft?: unknown };
  if (version !== VERSION || typeof draft !== "object" || draft === null) return false;
  const d = draft as Record<string, unknown>;
  const fonts = d.fonts;
  return (
    typeof d.name === "string" &&
    typeof d.colors === "object" &&
    typeof d.waiting === "object" &&
    typeof d.icons === "object" &&
    typeof fonts === "object" &&
    fonts !== null &&
    FONT_SLOTS.every((slot) => slot in fonts)
  );
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DATABASE, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB cannot be opened"));
    };
  });
}

async function withStore<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await open(factory);
  try {
    const transaction = database.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      };
    });
    const result = await request(run(transaction.objectStore(STORE)));
    await done;
    return result;
  } finally {
    database.close();
  }
}

export function indexedDbStore(factory: IDBFactory): DraftStore {
  return {
    async load() {
      const value = await withStore<unknown>(factory, "readonly", (store) => store.get(KEY));
      return isStoredDraft(value) ? value.draft : null;
    },
    async save(draft) {
      const stored: Stored = { version: VERSION, draft };
      await withStore(factory, "readwrite", (store) => store.put(stored, KEY));
    },
    async clear() {
      await withStore(factory, "readwrite", (store) => store.delete(KEY));
    },
  };
}

/** A store that keeps the draft in memory only: for tests, and where IndexedDB is unavailable. */
export function memoryStore(): DraftStore {
  let kept: ThemeDraft | null = null;
  return {
    load: () => Promise.resolve(kept === null ? null : structuredClone(kept)),
    save: (draft) => {
      kept = structuredClone(draft);
      return Promise.resolve();
    },
    clear: () => {
      kept = null;
      return Promise.resolve();
    },
  };
}

/** The store of the browser, or one in memory when the browser has no IndexedDB. */
export function browserStore(): DraftStore {
  return typeof indexedDB === "undefined" ? memoryStore() : indexedDbStore(indexedDB);
}
