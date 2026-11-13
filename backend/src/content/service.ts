// The content base: pages and the start page text (CNT-01 – CNT-05, LANG-02; sw-architecture.md
// 6.2). Every change runs in one transaction with its audit entry, which holds ids only.
import { and, eq, max } from "drizzle-orm";
import { CONTENT_LANGUAGE } from "@zappaloo/shared";
import type { ContentPage, ContentResponse, OrderRequest, PageRequest } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { contentPages, contentTexts } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";

export type ContentErrorCode = "slug_taken" | "page_not_found" | "order_mismatch";

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

export class ContentService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #now: () => Date;

  constructor(database: Database, event: EventService, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#event = event;
    this.#now = now;
  }

  /** The start page text and every page in the admin's order (`GET /api/content`). */
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
    const pages = db
      .select()
      .from(contentPages)
      .where(eq(contentPages.eventId, eventId))
      .orderBy(contentPages.position, contentPages.id)
      .all()
      .map((row): ContentPage => ({
        id: row.id,
        slug: row.slug,
        title: texts.get(pageItem(row.id))?.title ?? "",
        markdown: texts.get(pageItem(row.id))?.markdown ?? "",
        inMore: row.inMore,
        position: row.position,
      }));
    return { startMarkdown: texts.get(START_ITEM)?.markdown ?? "", pages };
  }

  /** Adds a page at the end of the list (CNT-05). */
  createPage(input: PageRequest, actor: Actor): ContentPage {
    return this.#database.db.transaction((tx) => {
      this.#requireFreeSlug(input.slug);
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
      this.#event.audit(actor, "content.page.create", { pageId: row.id }, tx);
      return {
        id: row.id,
        slug: row.slug,
        title: input.title,
        markdown: input.markdown,
        inMore: row.inMore,
        position: row.position,
      };
    });
  }

  /** Changes a page's address, title, text or visibility; the change is live at once (CNT-05). */
  updatePage(id: number, input: PageRequest, actor: Actor): ContentPage {
    return this.#database.db.transaction((tx) => {
      const current = this.#page(tx, id);
      if (input.slug !== current.slug) this.#requireFreeSlug(input.slug, id);
      const updated = tx
        .update(contentPages)
        .set({ slug: input.slug, inMore: input.inMore, updatedAt: this.#now() })
        .where(eq(contentPages.id, id))
        .returning()
        .get();
      this.#writeText(tx, pageItem(id), input.title, input.markdown);
      this.#event.audit(actor, "content.page.update", { pageId: id }, tx);
      return {
        id,
        slug: updated.slug,
        title: input.title,
        markdown: input.markdown,
        inMore: updated.inMore,
        position: updated.position,
      };
    });
  }

  /** Deletes a page and its text. */
  deletePage(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#page(tx, id);
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

  #page(tx: Pick<Database["db"], "select">, id: number) {
    const row = tx
      .select()
      .from(contentPages)
      .where(and(eq(contentPages.id, id), eq(contentPages.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new ContentError("page_not_found", `page ${String(id)} does not exist`);
    return row;
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
