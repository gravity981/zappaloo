// The content base: pages, the start page text, places and images (CNT-01 – CNT-07, LANG-02;
// sw-architecture.md 6.2). Every change of a text, a place, a page or an image runs in one
// transaction with its audit entry, which holds ids only. Image files are written to
// `$DATA_DIR/events/<event>/content/`; a file is removed after its row is gone.
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
  ImageItem,
  OrderRequest,
  PageRequest,
  PlaceRequest,
  StartRequest,
  StartSettings,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  contentImages,
  contentPagePlaces,
  contentPages,
  contentPlaces,
  contentStart,
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
  | "image_in_use"
  | "image_type"
  | "image_too_large"
  | "alt_required";

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
const placeItem = (id: number) => `place:${String(id)}`;

/** The URL an image is served at; a text uses an image with it (`![…](URL)`). */
const imageUrl = (id: number) => `/api/content/images/${String(id)}`;

/** Whether a text uses the image: the URL, and not a longer number that starts with it. */
export function usesImage(markdown: string, id: number): boolean {
  return new RegExp(`${imageUrl(id)}(?!\\d)`).test(markdown);
}

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
    return {
      startMarkdown: texts.get(START_ITEM)?.markdown ?? "",
      pages,
      places,
      start: this.#startSettings(db),
    };
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

  /** Deletes a page, its text, its places and its images (their files too). */
  async deletePage(id: number, actor: Actor): Promise<void> {
    const files = this.#database.db.transaction((tx) => {
      this.#page(tx, id);
      tx.delete(contentPagePlaces).where(eq(contentPagePlaces.pageId, id)).run();
      tx.delete(contentTexts)
        .where(
          and(eq(contentTexts.eventId, this.#event.eventId), eq(contentTexts.item, pageItem(id))),
        )
        .run();
      tx.delete(contentPages).where(eq(contentPages.id, id)).run();
      const images = this.#removeImagesOf(tx, pageItem(id));
      this.#event.audit(actor, "content.page.delete", { pageId: id }, tx);
      return images;
    });
    await this.#unlinkFiles(files);
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

  /**
   * Writes the welcome text of the start page (an empty text clears it) and, when given, its
   * settings: the hero image with its alt text, and the countdown switch (WEB-10, WEB-11).
   */
  setStart(input: StartRequest, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const current = this.#startSettings(tx);
      const heroImageId = input.heroImageId === undefined ? current.heroImageId : input.heroImageId;
      const heroAlt = input.heroAlt === undefined ? current.heroAlt : input.heroAlt;
      if (heroImageId !== null) {
        this.#requireImage(tx, heroImageId, "start");
        if (heroAlt === null || heroAlt.trim() === "") {
          throw new ContentError("alt_required", "the hero image needs its alt text");
        }
      }
      const countdown = input.countdown ?? current.countdown;
      this.#writeText(tx, START_ITEM, "", input.markdown);
      tx.insert(contentStart)
        .values({
          eventId: this.#event.eventId,
          heroImageId,
          heroAlt,
          countdown,
          updatedAt: this.#now(),
        })
        .onConflictDoUpdate({
          target: contentStart.eventId,
          set: { heroImageId, heroAlt, countdown, updatedAt: this.#now() },
        })
        .run();
      this.#event.audit(actor, "content.start.set", {}, tx);
    });
  }

  /** Adds a place (CNT-07). Its map image is uploaded to the saved place. */
  createPlace(input: PlaceRequest, actor: Actor): ContentPlace {
    if (input.mapImageId !== null) {
      throw new ContentError("image_not_found", "the map image is uploaded to a saved place");
    }
    return this.#database.db.transaction((tx) => {
      const now = this.#now();
      const row = tx
        .insert(contentPlaces)
        .values({
          eventId: this.#event.eventId,
          name: input.name,
          address: input.address,
          mapsUrl: input.mapsUrl,
          mapImageId: null,
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
      this.#requireMapImage(tx, input.mapImageId, id);
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

  /** Deletes a place that no program item and no page uses, with its map image (the uses are named). */
  async deletePlace(id: number, actor: Actor): Promise<void> {
    const files = this.#database.db.transaction((tx) => {
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
      // The place refers to its map image, so the place goes first.
      tx.delete(contentPlaces).where(eq(contentPlaces.id, id)).run();
      const images = this.#removeImagesOf(tx, placeItem(id));
      this.#event.audit(actor, "content.place.delete", { placeId: id }, tx);
      return images;
    });
    await this.#unlinkFiles(files);
  }

  /** The images of one owner, newest first (CNT-06). */
  images(item: ImageItem): ContentImage[] {
    return this.#database.db
      .select()
      .from(contentImages)
      .where(and(eq(contentImages.eventId, this.#event.eventId), eq(contentImages.item, item)))
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
   * Stores an image of `item` (CNT-06). Its type is taken from the content; anything other than
   * JPEG, PNG or WebP is refused, and the file is kept as uploaded.
   */
  async saveImage(bytes: Buffer, item: ImageItem, actor: Actor): Promise<ContentImage> {
    if (bytes.length > IMAGE_MAX_BYTES) {
      throw new ContentError("image_too_large", "the image is larger than 10 MB");
    }
    const detected = detectImage(bytes);
    if (!detected)
      throw new ContentError("image_type", "the file is not a JPEG, PNG or WebP image");
    this.#requireOwner(this.#database.db, item);
    const directory = this.#directory();
    const fileName = `${randomUUID()}.${detected.extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), bytes);
    try {
      return this.#database.db.transaction((tx) => {
        // The owner may have been removed while the file was written.
        this.#requireOwner(tx, item);
        const row = tx
          .insert(contentImages)
          .values({
            eventId: this.#event.eventId,
            item,
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

  /**
   * Removes an image. A text that still uses it refuses (`image_in_use`); the map image of a place
   * is simply unset.
   */
  async deleteImage(id: number, actor: Actor): Promise<void> {
    const file = this.#database.db.transaction((tx) => {
      const row = this.#image(tx, id);
      if (row.item === "start" && this.#startSettings(tx).heroImageId === id) {
        throw new ContentError("image_in_use", "the image is the hero image of the start page");
      }
      if (row.item === "start" || row.item.startsWith("page:")) {
        const text = tx
          .select({ markdown: contentTexts.markdown })
          .from(contentTexts)
          .where(
            and(
              eq(contentTexts.eventId, this.#event.eventId),
              eq(contentTexts.item, row.item),
              eq(contentTexts.language, CONTENT_LANGUAGE),
            ),
          )
          .get();
        if (text && usesImage(text.markdown, id)) {
          throw new ContentError("image_in_use", "the text still uses the image");
        }
      } else {
        tx.update(contentPlaces)
          .set({ mapImageId: null, updatedAt: this.#now() })
          .where(eq(contentPlaces.mapImageId, id))
          .run();
      }
      tx.delete(contentImages).where(eq(contentImages.id, id)).run();
      this.#event.audit(actor, "content.image.delete", { imageId: id }, tx);
      return row.fileName;
    });
    await this.#unlinkFiles([file]);
  }

  /** The file of an image of this event, for serving it (CNT-06). */
  image(id: number): StoredImage {
    const row = this.#image(this.#database.db, id);
    return {
      mime: row.mime as ImageType,
      path: join(this.#directory(), row.fileName),
    };
  }

  /** The settings of the start page; the defaults until they are saved (the switch is on). */
  #startSettings(tx: Pick<Database["db"], "select">): StartSettings {
    const row = tx
      .select()
      .from(contentStart)
      .where(eq(contentStart.eventId, this.#event.eventId))
      .get();
    return {
      heroImageId: row?.heroImageId ?? null,
      heroAlt: row?.heroAlt ?? null,
      countdown: row?.countdown ?? true,
    };
  }

  #directory(): string {
    return join(this.#eventsDir, this.#event.eventId, "content");
  }

  #image(tx: Pick<Database["db"], "select">, id: number) {
    const row = tx
      .select()
      .from(contentImages)
      .where(and(eq(contentImages.id, id), eq(contentImages.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new ContentError("image_not_found", `image ${String(id)} does not exist`);
    return row;
  }

  /** Deletes the image rows of an owner and returns their file names (removed after commit). */
  #removeImagesOf(tx: Pick<Database["db"], "select" | "delete">, item: string): string[] {
    const rows = tx
      .select({ id: contentImages.id, fileName: contentImages.fileName })
      .from(contentImages)
      .where(and(eq(contentImages.eventId, this.#event.eventId), eq(contentImages.item, item)))
      .all();
    for (const row of rows) {
      tx.delete(contentImages).where(eq(contentImages.id, row.id)).run();
    }
    return rows.map((row) => row.fileName);
  }

  /** Removes image files; a file that is already gone is no error. */
  async #unlinkFiles(fileNames: readonly string[]): Promise<void> {
    for (const fileName of fileNames) {
      await unlink(join(this.#directory(), fileName)).catch(() => undefined);
    }
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

  /** An image must belong to `owner` (its item); an image of another owner is not found. */
  #requireImage(tx: Pick<Database["db"], "select">, id: number, owner: string): void {
    if (this.#image(tx, id).item !== owner) {
      throw new ContentError("image_not_found", "the image does not belong to this text");
    }
  }

  /** The owner of an image must exist: the start page, a page, or a place. */
  #requireOwner(tx: Pick<Database["db"], "select">, item: ImageItem): void {
    if (item === "start") return;
    const [kind, rawId] = item.split(":");
    const id = Number(rawId);
    if (kind === "page") this.#page(tx, id);
    else this.#place(tx, id);
  }

  /** A map image must be an image of this place; `null` is no image. */
  #requireMapImage(tx: Pick<Database["db"], "select">, id: number | null, placeId: number): void {
    if (id === null) return;
    const row = this.#image(tx, id);
    if (row.item !== placeItem(placeId)) {
      throw new ContentError("image_not_found", "the image is not the map image of this place");
    }
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
