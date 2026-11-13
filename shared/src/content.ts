// The content base: website pages and the start page text (CNT-01 – CNT-05, LANG-02;
// sw-architecture.md 6.2). Each text is stored per language key; only German is maintained.
import { z } from "zod";

/** The one language the content is maintained in (LANG-02). */
export const CONTENT_LANGUAGE = "de";

export const PAGE_TITLE_MAX_LENGTH = 120;
export const PAGE_SLUG_MAX_LENGTH = 60;
/** The longest Markdown text of a page or of the start page. */
export const CONTENT_MAX_LENGTH = 50_000;

/** A page address part: lower-case letters, digits and single hyphens, e.g. `anreise-parkieren`. */
export const pageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lower-case letters, digits and hyphens");

export const pageTitleSchema = z.string().trim().min(1).max(PAGE_TITLE_MAX_LENGTH);
export const contentMarkdownSchema = z.string().max(CONTENT_MAX_LENGTH);

/** One page as the website and the editor read it (`/p/<slug>`). */
export const contentPageSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  title: z.string(),
  markdown: z.string(),
  /** "In «Mehr» sichtbar": whether the page is listed under "Mehr". */
  inMore: z.boolean(),
  /** Position in the list, from 0. */
  position: z.number().int().nonnegative(),
});
export type ContentPage = z.infer<typeof contentPageSchema>;

/** `GET /api/content` (signed in): the start page text and all pages in their order. */
export const contentResponseSchema = z.object({
  /** The welcome block of the start page; empty until the admin writes it. */
  startMarkdown: z.string(),
  pages: z.array(contentPageSchema),
});
export type ContentResponse = z.infer<typeof contentResponseSchema>;

/** `POST /api/content/pages` and `PUT /api/content/pages/:id`. */
export const pageRequestSchema = z.strictObject({
  slug: pageSlugSchema,
  title: pageTitleSchema,
  markdown: contentMarkdownSchema,
  inMore: z.boolean(),
});
export type PageRequest = z.infer<typeof pageRequestSchema>;

/** `PUT /api/content/start`: the new welcome text ("" leaves the start page without a text). */
export const startRequestSchema = z.strictObject({ markdown: contentMarkdownSchema });
export type StartRequest = z.infer<typeof startRequestSchema>;

/** `PUT /api/content/order`: every page id once, in the new order. */
export const orderRequestSchema = z.strictObject({
  ids: z.array(z.number().int().positive()),
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;
