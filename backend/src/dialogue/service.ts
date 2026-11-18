// The dialogues of the game world (sw-architecture.md 6.2, 14.4; CNT-02, CNT-03, CNT-08): the admin edits them in
// Erlebniswelt › Dialoge; a clickable object with the action `dialog` shows one. A dialogue in use cannot be deleted;
// a new id keeps the admin's assignments. Every change and its audit entry (ids only) run in one transaction.
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { DIALOGUE_LIMITS, worldActionSchema } from "@zappaloo/shared";
import type {
  DialogueDetail,
  DialogueGuest,
  DialogueRequest,
  DialogueSummary,
  DialogueUse,
} from "@zappaloo/shared";
import { detectImage } from "../content/images.ts";
import { dialogues, worldObjectActions } from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import type { WorldService } from "../world/service.ts";

export class DialogueError extends Error {
  readonly code:
    | "dialogue_not_found"
    | "dialogue_exists"
    | "dialogue_in_use"
    | "portrait_too_large"
    | "portrait_type"
    | "portrait_invalid";
  /** For `dialogue_in_use`: the objects that show the dialogue. */
  readonly used: DialogueUse[];

  constructor(code: DialogueError["code"], message: string, used: DialogueUse[] = []) {
    super(message);
    this.name = "DialogueError";
    this.code = code;
    this.used = used;
  }
}

type Row = typeof dialogues.$inferSelect;

const linesOf = (row: Row): string[] => JSON.parse(row.lines) as string[];

export class DialogueService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #world: WorldService;

  constructor(database: Database, event: EventService, world: WorldService) {
    this.#database = database;
    this.#event = event;
    this.#world = world;
  }

  #row(id: string): Row | undefined {
    return this.#database.db
      .select()
      .from(dialogues)
      .where(and(eq(dialogues.eventId, this.#event.eventId), eq(dialogues.id, id)))
      .get();
  }

  #require(id: string): Row {
    const row = this.#row(id);
    if (row === undefined)
      throw new DialogueError("dialogue_not_found", "there is no such dialogue");
    return row;
  }

  /** The objects whose effective action (the admin's assignment, else the Tiled preset) shows the dialogue. */
  usedBy(id: string): DialogueUse[] {
    const used: DialogueUse[] = [];
    for (const map of this.#world.objects().maps) {
      for (const clickable of map.clickables) {
        const action = clickable.override ?? clickable.preset;
        if (action?.kind === "dialog" && action.dialogId === id) {
          used.push({
            map: map.id,
            mapName: map.name ?? null,
            object: clickable.name,
            label: clickable.label ?? null,
          });
        }
      }
    }
    return used;
  }

  /** All dialogues by id, with the objects that show them. */
  list(): DialogueSummary[] {
    return this.#database.db
      .select()
      .from(dialogues)
      .where(eq(dialogues.eventId, this.#event.eventId))
      .all()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => ({
        id: row.id,
        npcName: row.npcName,
        lines: linesOf(row).length,
        portrait: row.portrait !== null,
        usedBy: this.usedBy(row.id),
      }));
  }

  #detail(row: Row): DialogueDetail {
    return {
      id: row.id,
      npcName: row.npcName,
      lines: linesOf(row),
      portrait: row.portrait === null ? null : row.updatedAt.getTime(),
      usedBy: this.usedBy(row.id),
    };
  }

  get(id: string): DialogueDetail {
    return this.#detail(this.#require(id));
  }

  create(request: DialogueRequest, actor: Actor): DialogueDetail {
    const eventId = this.#event.eventId;
    if (this.#row(request.id) !== undefined) {
      throw new DialogueError("dialogue_exists", "there is a dialogue with this id already");
    }
    this.#database.db.transaction((tx) => {
      tx.insert(dialogues)
        .values({
          eventId,
          id: request.id,
          npcName: request.npcName,
          lines: JSON.stringify(request.lines),
          updatedAt: new Date(),
        })
        .run();
      this.#event.audit(actor, "dialogue.create", { dialogue: request.id }, tx);
    });
    return this.get(request.id);
  }

  /**
   * Changes a dialogue; a new id is taken over by the admin's assignments (they follow the dialogue), while presets in
   * Tiled files that name the old id point to nothing then (a warning, MAP-08).
   */
  update(id: string, request: DialogueRequest, actor: Actor): DialogueDetail {
    const eventId = this.#event.eventId;
    this.#require(id);
    const renamed = request.id !== id;
    if (renamed && this.#row(request.id) !== undefined) {
      throw new DialogueError("dialogue_exists", "there is a dialogue with this id already");
    }
    this.#database.db.transaction((tx) => {
      tx.update(dialogues)
        .set({
          id: request.id,
          npcName: request.npcName,
          lines: JSON.stringify(request.lines),
          updatedAt: new Date(),
        })
        .where(and(eq(dialogues.eventId, eventId), eq(dialogues.id, id)))
        .run();
      if (renamed) {
        for (const row of tx
          .select()
          .from(worldObjectActions)
          .where(eq(worldObjectActions.eventId, eventId))
          .all()) {
          const action = worldActionSchema.safeParse(JSON.parse(row.action));
          if (!action.success || action.data.kind !== "dialog" || action.data.dialogId !== id)
            continue;
          tx.update(worldObjectActions)
            .set({ action: JSON.stringify({ kind: "dialog", dialogId: request.id }) })
            .where(
              and(
                eq(worldObjectActions.eventId, eventId),
                eq(worldObjectActions.mapId, row.mapId),
                eq(worldObjectActions.objectName, row.objectName),
              ),
            )
            .run();
        }
      }
      this.#event.audit(
        actor,
        "dialogue.update",
        renamed ? { dialogue: id, renamedTo: request.id } : { dialogue: id },
        tx,
      );
    });
    return this.get(request.id);
  }

  /** Deletes a dialogue that no object shows; the error names the objects that do. */
  delete(id: string, actor: Actor): void {
    this.#require(id);
    const used = this.usedBy(id);
    if (used.length > 0) {
      throw new DialogueError("dialogue_in_use", "an object shows this dialogue", used);
    }
    const eventId = this.#event.eventId;
    this.#database.db.transaction((tx) => {
      tx.delete(dialogues)
        .where(and(eq(dialogues.eventId, eventId), eq(dialogues.id, id)))
        .run();
      this.#event.audit(actor, "dialogue.delete", { dialogue: id }, tx);
    });
  }

  /**
   * Stores the portrait as uploaded (CNT-08): JPEG, PNG or WebP by content, at most 1 MB and 512 pixels per side. It
   * is not changed, so pixel art stays crisp.
   */
  async setPortrait(id: string, upload: Uint8Array, actor: Actor): Promise<DialogueDetail> {
    this.#require(id);
    if (upload.byteLength > DIALOGUE_LIMITS.portraitBytes) {
      throw new DialogueError("portrait_too_large", "the portrait is larger than 1 MB");
    }
    const detected = detectImage(upload);
    if (detected === undefined) {
      throw new DialogueError("portrait_type", "the file is not a JPEG, PNG or WebP image");
    }
    let size: { width: number; height: number };
    try {
      const meta = await sharp(upload).metadata();
      size = { width: meta.width, height: meta.height };
    } catch {
      throw new DialogueError("portrait_invalid", "the portrait cannot be read");
    }
    if (size.width > DIALOGUE_LIMITS.portraitSide || size.height > DIALOGUE_LIMITS.portraitSide) {
      throw new DialogueError("portrait_too_large", "the portrait is larger than 512 pixels");
    }
    const eventId = this.#event.eventId;
    this.#database.db.transaction((tx) => {
      tx.update(dialogues)
        .set({ portrait: Buffer.from(upload), portraitMime: detected.mime, updatedAt: new Date() })
        .where(and(eq(dialogues.eventId, eventId), eq(dialogues.id, id)))
        .run();
      this.#event.audit(actor, "dialogue.portrait", { dialogue: id, set: true }, tx);
    });
    return this.get(id);
  }

  deletePortrait(id: string, actor: Actor): DialogueDetail {
    this.#require(id);
    const eventId = this.#event.eventId;
    this.#database.db.transaction((tx) => {
      tx.update(dialogues)
        .set({ portrait: null, portraitMime: null, updatedAt: new Date() })
        .where(and(eq(dialogues.eventId, eventId), eq(dialogues.id, id)))
        .run();
      this.#event.audit(actor, "dialogue.portrait", { dialogue: id, set: false }, tx);
    });
    return this.get(id);
  }

  /** The portrait picture, or undefined without one. */
  portrait(id: string): { bytes: Buffer; mime: string } | undefined {
    const row = this.#row(id);
    return row?.portrait != null && row.portraitMime !== null
      ? { bytes: row.portrait, mime: row.portraitMime }
      : undefined;
  }

  /** The dialogue as the game shows it (CNT-02); throws `dialogue_not_found`. */
  forGuest(id: string): DialogueGuest {
    const row = this.#require(id);
    return {
      id: row.id,
      npcName: row.npcName,
      lines: linesOf(row),
      portrait: row.portrait === null ? null : row.updatedAt.getTime(),
    };
  }
}
