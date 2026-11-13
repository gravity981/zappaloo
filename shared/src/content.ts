// The content base: website pages, the start page text, places and images (CNT-01 – CNT-07,
// LANG-02; sw-architecture.md 6.2). Each text is stored per language key; only German is maintained.
import { z } from "zod";

/** The one language the content is maintained in (LANG-02). */
export const CONTENT_LANGUAGE = "de";

export const PAGE_TITLE_MAX_LENGTH = 120;
export const PAGE_SLUG_MAX_LENGTH = 60;
/** The longest Markdown text of a page or of the start page. */
export const CONTENT_MAX_LENGTH = 50_000;
/** The largest image upload (CNT-06, 6.2). */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** The image types the editor accepts; the type is taken from the file's content (6.2). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PLACE_NAME_MAX_LENGTH = 120;
export const PLACE_ADDRESS_MAX_LENGTH = 200;
const PLACE_LINK_MAX_LENGTH = 500;

/** A page address part: lower-case letters, digits and single hyphens, e.g. `anreise-parkieren`. */
export const pageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lower-case letters, digits and hyphens");

export const pageTitleSchema = z.string().trim().min(1).max(PAGE_TITLE_MAX_LENGTH);
export const contentMarkdownSchema = z.string().max(CONTENT_MAX_LENGTH);

/**
 * A Google Maps link (6.2): `https` only, to `maps.google.com`, `maps.app.goo.gl`, or to
 * `google.com`, `www.google.com` and `goo.gl` with a path under `/maps`. Nothing is embedded.
 */
export function isGoogleMapsUrl(value: string): boolean {
  // `https://host[/path, ?query or #fragment]`: no user information and no port (the host
  // pattern does not allow `@` or `:`), so the link cannot point somewhere else.
  const match = /^https:\/\/([a-z0-9.-]+)([/?#].*)?$/i.exec(value);
  if (!match) return false;
  const host = (match[1] ?? "").toLowerCase();
  const path = match[2] ?? "";
  if (host === "maps.google.com" || host === "maps.app.goo.gl") return true;
  if (["google.com", "www.google.com", "goo.gl"].includes(host)) {
    return /^\/maps([/?#]|$)/.test(path);
  }
  return false;
}

/** One place (CNT-07): a name, an optional address, an optional Google Maps link and map image. */
export const placeNameSchema = z.string().trim().min(1).max(PLACE_NAME_MAX_LENGTH);
export const placeRequestSchema = z.strictObject({
  name: placeNameSchema,
  address: z.string().trim().min(1).max(PLACE_ADDRESS_MAX_LENGTH).nullable(),
  mapsUrl: z
    .string()
    .trim()
    .min(1)
    .max(PLACE_LINK_MAX_LENGTH)
    .refine(isGoogleMapsUrl, "a https link to Google Maps")
    .nullable(),
  /** An uploaded image (`GET /api/content/images/<id>`), or none. */
  mapImageId: z.number().int().positive().nullable(),
});
export type PlaceRequest = z.infer<typeof placeRequestSchema>;

export const contentPlaceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  address: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  mapImageId: z.number().int().positive().nullable(),
});
export type ContentPlace = z.infer<typeof contentPlaceSchema>;

/** One uploaded image as the editor lists it (CNT-06). */
export const contentImageSchema = z.object({
  id: z.number().int().positive(),
  mime: z.enum(IMAGE_TYPES),
  bytes: z.number().int().nonnegative(),
  /** ISO date-time of the upload. */
  createdAt: z.string(),
});
export type ContentImage = z.infer<typeof contentImageSchema>;

/**
 * Whose an image is (6.2): the start page (`start`), one page (`page:<id>`) or one place, as its map
 * image (`place:<id>`). Images belong to exactly one of them.
 */
export const imageItemSchema = z.string().regex(/^(start|page:[1-9]\d*|place:[1-9]\d*)$/);
export type ImageItem = z.infer<typeof imageItemSchema>;

/** The owner of the images a request lists or uploads: `?item=page:3`. */
export const imagesQuerySchema = z.strictObject({ item: imageItemSchema });

/** `GET /api/content/images?item=…` (editor). */
export const imagesResponseSchema = z.object({ images: z.array(contentImageSchema) });
export type ImagesResponse = z.infer<typeof imagesResponseSchema>;

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
  /** The places the page lists as cards next to its text (CNT-07). */
  placeIds: z.array(z.number().int().positive()),
});
export type ContentPage = z.infer<typeof contentPageSchema>;

/** The settings of the start page (WEB-10, WEB-11): the hero image, its alt text, the countdown switch. */
export const heroAltSchema = z.string().trim().min(1).max(200);
export const startSettingsSchema = z.object({
  /** One of the start page's images, or none. */
  heroImageId: z.number().int().positive().nullable(),
  heroAlt: z.string().nullable(),
  /** "Countdown auf der Startseite zeigen" (default on). */
  countdown: z.boolean(),
});
export type StartSettings = z.infer<typeof startSettingsSchema>;

/** `GET /api/content` (signed in): the start page text, all pages in their order, the places. */
export const contentResponseSchema = z.object({
  /** The welcome block of the start page; empty until the admin writes it. */
  startMarkdown: z.string(),
  pages: z.array(contentPageSchema),
  places: z.array(contentPlaceSchema),
  start: startSettingsSchema,
});
export type ContentResponse = z.infer<typeof contentResponseSchema>;

/** `POST /api/content/pages` and `PUT /api/content/pages/:id`. */
export const pageRequestSchema = z.strictObject({
  slug: pageSlugSchema,
  title: pageTitleSchema,
  markdown: contentMarkdownSchema,
  inMore: z.boolean(),
  /** The places the page lists; each one exists. */
  placeIds: z.array(z.number().int().positive()).max(100).default([]),
});
export type PageRequest = z.infer<typeof pageRequestSchema>;

/**
 * `PUT /api/content/start`: the welcome text, and optionally the settings. A missing setting stays
 * as it is; a hero image needs its alt text (checked by the server, which knows the current state).
 */
export const startRequestSchema = z.strictObject({
  markdown: contentMarkdownSchema,
  heroImageId: z.number().int().positive().nullable().optional(),
  heroAlt: heroAltSchema.nullable().optional(),
  countdown: z.boolean().optional(),
});
export type StartRequest = z.infer<typeof startRequestSchema>;

/** The countdown card (WEB-11): the calendar days to the day of the first program item. */
export const countdownSchema = z.object({
  days: z.number().int().positive(),
  /** The day of the first program item, `2027-06-12`, in the event's time zone. */
  date: z.string(),
  placeName: z.string().nullable(),
});
export type Countdown = z.infer<typeof countdownSchema>;

/** One entry of the schedule as the website shows it (WEB-07). */
export const scheduleEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  /** ISO date-time. */
  startsAt: z.string(),
  /** ISO date-time, or null when the entry has no end. */
  endsAt: z.string().nullable(),
  placeName: z.string().nullable(),
});
export type ScheduleEntryView = z.infer<typeof scheduleEntrySchema>;

/**
 * `GET /api/website` (signed in): what the website computes for the start page. On the event day
 * (from the day of the first program item, in the event's time zone) the start page shows "now" and
 * "next" instead of the countdown (WEB-07, WEB-10).
 */
export const websiteResponseSchema = z.object({
  countdown: countdownSchema.nullable(),
  eventDay: z.boolean(),
  /** The day of the first program item, `2027-06-12`, or null without program items. */
  eventDate: z.string().nullable(),
  now: scheduleEntrySchema.nullable(),
  next: scheduleEntrySchema.nullable(),
});
export type WebsiteResponse = z.infer<typeof websiteResponseSchema>;

/** How an entry looks on the programme page: greyed out once past, marked while current. */
export const entryStatusSchema = z.enum(["past", "now", "upcoming"]);

/**
 * `GET /api/programme` (signed in): the program items the guest is invited to, as a timeline (WEB-09).
 * Outside the event day every entry is "upcoming".
 */
export const programmeResponseSchema = z.object({
  /** True when the programme leaves out program items the guest is not invited to (WEB-09). */
  hidden: z.boolean(),
  eventDay: z.boolean(),
  eventDate: z.string().nullable(),
  items: z.array(scheduleEntrySchema.extend({ status: entryStatusSchema })),
});
export type ProgrammeResponse = z.infer<typeof programmeResponseSchema>;

/** `PUT /api/content/order`: every page id once, in the new order. */
export const orderRequestSchema = z.strictObject({
  ids: z.array(z.number().int().positive()),
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;
