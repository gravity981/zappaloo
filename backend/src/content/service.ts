// The content base: pages, the start page text, places and images (CNT-01 – CNT-07, LANG-02;
// sw-architecture.md 6.2). Every change of a text, a place or a page runs in one transaction with
// its audit entry, which holds ids only. Image files are written to `$DATA_DIR/events/<event>/content/`.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, count, eq, inArray, max } from "drizzle-orm";
import { CONTENT_LANGUAGE, IMAGE_MAX_BYTES } from "@zappaloo/shared";
import type {
  ContentImage,
  ContentPage,
  ContentPlace,
  ContentResponse,
  OrderRequest,
  PageRequest,
  PlaceRequest,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  contentImages,
  contentPagePlaces,
  contentPages,
  contentPlaces,
  contentTexts,
  programItems,
} from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import { detectImage } from "./images.ts";
import type { ImageType } from "./images.ts";

export type ContentErrorCode =
  | "slug_taken"
  | "page_not_found"
  | "order_mismatch"
  | "place_not_found"
  | "place_in_use"
  | "image_not_found"
  | "image_type"
  | "image_too_large";

export class ContentError extends Error {
  readonly code: ContentErrorCode;

  constructor(code: ContentErrorCode, message: string) {
    super(message);
    this.name = "ContentError";
    this.code = code;
  }
}

/** The item of the start page's welcome text in `content_texts`. */
const START_ITEM = "start";
const pageItem = (id: number) => `page:${String(id)}`;

/** A stored image as the editor lists it, and the file it is served from. */
export interface StoredImage {
  mime: ImageType;
  path: string;
}

export class ContentService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #eventsDir: string;
  readonly #now: () => Date;

  constructor(
    database: Database,
    event: EventService,
    eventsDir: string,
    now: () => Date = () => new Date(),
  ) {
    this.#database = database;
    this.#event = event;
    this.#eventsDir = eventsDir;
    this.#now = now;
  }

  /** The start page text, every page in the admin's order, and the places (`GET /api/content`). */
  get(): ContentResponse {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const texts = new Map(
      db
        .select()
        .from(contentTexts)
        .where(and(eq(contentTexts.eventId, eventId), eq(contentTexts.language, CONTENT_LANGUAGE)))
        .all()
        .map((row) => [row.item, row] as const),
    );
    const pageRows = db
      .select()
      .from(contentPages)
      .where(eq(contentPages.eventId, eventId))
      .orderBy(contentPages.position, contentPages.id)
      .all();
    const links = new Map<number, number[]>();
    if (pageRows.length > 0) {
      for (const link of db
        .select()
        .from(contentPagePlaces)
        .where(
          inArray(
            contentPagePlaces.pageId,
            pageRows.map((row) => row.id),
          ),
        )
        .orderBy(contentPagePlaces.placeId)
        .all()) {
        const ids = links.get(link.pageId) ?? [];
        ids.push(link.placeId);
        links.set(link.pageId, ids);
      }
    }
    const pages = pageRows.map((row): ContentPage => ({
      id: row.id,
      slug: row.slug,
      title: texts.get(pageItem(row.id))?.title ?? "",
      markdown: texts.get(pageItem(row.id))?.markdown ?? "",
      inMore: row.inMore,
      position: row.position,
      placeIds: links.get(row.id) ?? [],
    }));
    const places = db
      .select()
      .from(contentPlaces)
      .where(eq(contentPlaces.eventId, eventId))
      .orderBy(contentPlaces.name, contentPlaces.id)
      .all()
      .map(toPlace);
    return { startMarkdown: texts.get(START_ITEM)?.markdown ?? "", pages, places };
  }

  /** Adds a page at the end of the list (CNT-05). */
  createPage(input: PageRequest, actor: Actor): ContentPage {
    return this.#database.db.transaction((tx) => {
      this.#requireFreeSlug(input.slug);
      this.#requirePlaces(tx, input.placeIds);
      const last = tx
        .select({ value: max(contentPages.position) })
        .from(contentPages)
        .where(eq(contentPages.eventId, this.#event.eventId))
        .get();
      const position = last?.value === null || last?.value === undefined ? 0 : last.value + 1;
      const now = this.#now();
      const row = tx
        .insert(contentPages)
        .values({
          eventId: this.#event.eventId,
          slug: input.slug,
          inMore: input.inMore,
          position,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      this.#writeText(tx, pageItem(row.id), input.title, input.markdown);
      this.#writePlaces(tx, row.id, input.placeIds);
      this.#event.audit(actor, "content.page.create", { pageId: row.id }, tx);
      return {
        id: row.id,
        slug: row.slug,
        title: input.title,
        markdown: input.markdown,
        inMore: row.inMore,
        position: row.position,
        placeIds: [...input.placeIds].sort((a, b) => a - b),
      };
    });
  }

  /** Changes a page's address, title, text, visibility or places; the change is live at once (CNT-05). */
  updatePage(id: number, input: PageRequest, actor: Actor): ContentPage {
    return this.#database.db.transaction((tx) => {
      const current = this.#page(tx, id);
      if (input.slug !== current.slug) this.#requireFreeSlug(input.slug, id);
      this.#requirePlaces(tx, input.placeIds);
      const updated = tx
        .update(contentPages)
        .set({ slug: input.slug, inMore: input.inMore, updatedAt: this.#now() })
        .where(eq(contentPages.id, id))
        .returning()
        .get();
      this.#writeText(tx, pageItem(id), input.title, input.markdown);
      this.#writePlaces(tx, id, input.placeIds);
      this.#event.audit(actor, "content.page.update", { pageId: id }, tx);
      return {
        id,
        slug: updated.slug,
        title: input.title,
        markdown: input.markdown,
        inMore: updated.inMore,
        position: updated.position,
        placeIds: [...input.placeIds].sort((a, b) => a - b),
      };
    });
  }

  /** Deletes a page, its text and its places. */
  deletePage(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#page(tx, id);
      tx.delete(contentPagePlaces).where(eq(contentPagePlaces.pageId, id)).run();
      tx.delete(contentTexts)
        .where(
          and(eq(contentTexts.eventId, this.#event.eventId), eq(contentTexts.item, pageItem(id))),
        )
        .run();
      tx.delete(contentPages).where(eq(contentPages.id, id)).run();
      this.#event.audit(actor, "content.page.delete", { pageId: id }, tx);
    });
  }

  /** Puts the pages in the given order. The list must name every page exactly once. */
  reorder(input: OrderRequest, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const existing = tx
        .select({ id: contentPages.id })
        .from(contentPages)
        .where(eq(contentPages.eventId, this.#event.eventId))
        .all()
        .map((row) => row.id);
      const wanted = new Set(input.ids);
      if (wanted.size !== input.ids.length || existing.length !== input.ids.length) {
        throw new ContentError("order_mismatch", "the order must name every page once");
      }
      if (!existing.every((id) => wanted.has(id))) {
        throw new ContentError("order_mismatch", "the order must name every page once");
      }
      input.ids.forEach((id, position) => {
        tx.update(contentPages).set({ position }).where(eq(contentPages.id, id)).run();
      });
      this.#event.audit(actor, "content.pages.order", { count: input.ids.length }, tx);
    });
  }

  /** Writes the welcome text of the start page. An empty text clears it. */
  setStart(markdown: string, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#writeText(tx, START_ITEM, "", markdown);
      this.#event.audit(actor, "content.start.set", {}, tx);
    });
  }

  /** Adds a place (CNT-07). */
  createPlace(input: PlaceRequest, actor: Actor): ContentPlace {
    return this.#database.db.transaction((tx) => {
      this.#requireImage(tx, input.mapImageId);
      const now = this.#now();
      const row = tx
        .insert(contentPlaces)
        .values({
          eventId: this.#event.eventId,
          name: input.name,
          address: input.address,
          mapsUrl: input.mapsUrl,
          mapImageId: input.mapImageId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      this.#event.audit(actor, "content.place.create", { placeId: row.id }, tx);
      return toPlace(row);
    });
  }

  /** Changes a place. Pages and program items show the change at once. */
  updatePlace(id: number, input: PlaceRequest, actor: Actor): ContentPlace {
    return this.#database.db.transaction((tx) => {
      this.#place(tx, id);
      this.#requireImage(tx, input.mapImageId);
      const row = tx
        .update(contentPlaces)
        .set({
          name: input.name,
          address: input.address,
          mapsUrl: input.mapsUrl,
          mapImageId: input.mapImageId,
          updatedAt: this.#now(),
        })
        .where(eq(contentPlaces.id, id))
        .returning()
        .get();
      this.#event.audit(actor, "content.place.update", { placeId: id }, tx);
      return toPlace(row);
    });
  }

  /** Deletes a place that no program item and no page uses (the uses are named in the error). */
  deletePlace(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#place(tx, id);
      const items = tx
        .select({ value: count() })
        .from(programItems)
        .where(eq(programItems.placeId, id))
        .get()?.value;
      const pages = tx
        .select({ value: count() })
        .from(contentPagePlaces)
        .where(eq(contentPagePlaces.placeId, id))
        .get()?.value;
      if ((items ?? 0) > 0 || (pages ?? 0) > 0) {
        throw new ContentError(
          "place_in_use",
          `the place is used by ${String(items ?? 0)} program items and ${String(pages ?? 0)} pages`,
        );
      }
      tx.delete(contentPlaces).where(eq(contentPlaces.id, id)).run();
      this.#event.audit(actor, "content.place.delete", { placeId: id }, tx);
    });
  }

  /** The uploaded images, newest first (CNT-06). */
  images(): ContentImage[] {
    return this.#database.db
      .select()
      .from(contentImages)
      .where(eq(contentImages.eventId, this.#event.eventId))
      .orderBy(contentImages.id)
      .all()
      .reverse()
      .map((row) => ({
        id: row.id,
        mime: row.mime as ImageType,
        bytes: row.bytes,
        createdAt: row.createdAt.toISOString(),
      }));
  }

  /**
   * Stores an uploaded image (CNT-06). Its type is taken from the content; anything other than
   * JPEG, PNG or WebP is refused, and the file is kept as uploaded.
   */
  async saveImage(bytes: Buffer, actor: Actor): Promise<ContentImage> {
    if (bytes.length > IMAGE_MAX_BYTES) {
      throw new ContentError("image_too_large", "the image is larger than 10 MB");
    }
    const detected = detectImage(bytes);
    if (!detected)
      throw new ContentError("image_type", "the file is not a JPEG, PNG or WebP image");
    const directory = join(this.#eventsDir, this.#event.eventId, "content");
    const fileName = `${randomUUID()}.${detected.extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), bytes);
    try {
      return this.#database.db.transaction((tx) => {
        const row = tx
          .insert(contentImages)
          .values({
            eventId: this.#event.eventId,
            fileName,
            mime: detected.mime,
            bytes: bytes.length,
            createdAt: this.#now(),
          })
          .returning()
          .get();
        this.#event.audit(actor, "content.image.upload", { imageId: row.id }, tx);
        return {
          id: row.id,
          mime: detected.mime,
          bytes: row.bytes,
          createdAt: row.createdAt.toISOString(),
        };
      });
    } catch (error) {
      await unlink(join(directory, fileName)).catch(() => undefined);
      throw error;
    }
  }

  /** The file of an image of this event, for serving it (CNT-06). */
  image(id: number): StoredImage {
    const row = this.#database.db
      .select()
      .from(contentImages)
      .where(and(eq(contentImages.id, id), eq(contentImages.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new ContentError("image_not_found", `image ${String(id)} does not exist`);
    return {
      mime: row.mime as ImageType,
      path: join(this.#eventsDir, this.#event.eventId, "content", row.fileName),
    };
  }

  #page(tx: Pick<Database["db"], "select">, id: number) {
    const row = tx
      .select()
      .from(contentPages)
      .where(and(eq(contentPages.id, id), eq(contentPages.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new ContentError("page_not_found", `page ${String(id)} does not exist`);
    return row;
  }

  #place(tx: Pick<Database["db"], "select">, id: number) {
    const row = tx
      .select()
      .from(contentPlaces)
      .where(and(eq(contentPlaces.id, id), eq(contentPlaces.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new ContentError("place_not_found", `place ${String(id)} does not exist`);
    return row;
  }

  /** Every listed place must exist in this event. */
  #requirePlaces(tx: Pick<Database["db"], "select">, ids: readonly number[]): void {
    for (const id of new Set(ids)) this.#place(tx, id);
  }

  /** A map image must be an image of this event; `null` is no image. */
  #requireImage(tx: Pick<Database["db"], "select">, id: number | null): void {
    if (id === null) return;
    const row = tx
      .select({ id: contentImages.id })
      .from(contentImages)
      .where(and(eq(contentImages.id, id), eq(contentImages.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new ContentError("image_not_found", `image ${String(id)} does not exist`);
  }

  /** Replaces the places a page lists. */
  #writePlaces(tx: Pick<Database["db"], "delete" | "insert">, pageId: number, ids: number[]) {
    tx.delete(contentPagePlaces).where(eq(contentPagePlaces.pageId, pageId)).run();
    for (const placeId of new Set(ids)) {
      tx.insert(contentPagePlaces).values({ eventId: this.#event.eventId, pageId, placeId }).run();
    }
  }

  /** Refuses an address another page has. `except` is the page being renamed. */
  #requireFreeSlug(slug: string, except?: number): void {
    const taken = this.#database.db
      .select({ id: contentPages.id })
      .from(contentPages)
      .where(and(eq(contentPages.eventId, this.#event.eventId), eq(contentPages.slug, slug)))
      .get();
    if (taken !== undefined && taken.id !== except) {
      throw new ContentError("slug_taken", `the address ${slug} is taken`);
    }
  }

  #writeText(
    tx: Pick<Database["db"], "insert">,
    item: string,
    title: string,
    markdown: string,
  ): void {
    tx.insert(contentTexts)
      .values({
        eventId: this.#event.eventId,
        item,
        language: CONTENT_LANGUAGE,
        title,
        markdown,
        updatedAt: this.#now(),
      })
      .onConflictDoUpdate({
        target: [contentTexts.eventId, contentTexts.item, contentTexts.language],
        set: { title, markdown, updatedAt: this.#now() },
      })
      .run();
  }
}

type PlaceRow = typeof contentPlaces.$inferSelect;

/** A place row as the API serves it. */
function toPlace(row: PlaceRow): ContentPlace {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    mapsUrl: row.mapsUrl,
    mapImageId: row.mapImageId,
  };
}
