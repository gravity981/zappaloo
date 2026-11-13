// Paths and small helpers of the content editor (sw-architecture.md 6.2; UX mock `admin-content`),
// shared by its screens: the list, the page editor and the place editor.

/** The list of Inhalte in the admin area. */
export const CONTENT_LIST = "/admin/content";

export const CONTENT_PATH = "/api/content";
export const PAGES_PATH = "/api/content/pages";
export const ORDER_PATH = "/api/content/order";
export const START_PATH = "/api/content/start";
export const PLACES_PATH = "/api/content/places";
export const IMAGES_PATH = "/api/content/images";

/** The owner of an image or a text: the start page, one page, or one place (6.2). */
export const pageItem = (id: number): string => `page:${String(id)}`;
export const placeItem = (id: number): string => `place:${String(id)}`;

/** The images of one owner (`GET` and upload, `?item=page:3`). */
export const imagesPath = (item: string): string => `${IMAGES_PATH}?item=${item}`;

/** The Markdown that shows an uploaded image in a text (CNT-06). */
export function imageMarkdown(alt: string, id: number): string {
  return `![${alt}](${IMAGES_PATH}/${String(id)})`;
}

/** Whether a text shows the image: its address, and not a longer number that starts with it. */
export function textUsesImage(markdown: string, id: number): boolean {
  return new RegExp(`${IMAGES_PATH}/${String(id)}(?!\\d)`).test(markdown);
}

/** A slug from a title: "Anreise & Parkieren" → "anreise-parkieren". */
export function slugFrom(title: string): string {
  return title
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
