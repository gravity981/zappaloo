// The closed platform and its waiting page (sw-architecture.md 10.4, ACS-10 – ACS-13): the
// schemas of the settings, of the page data and of an event's own door scene.
import { z } from "zod";
import { RSVP_STATUSES } from "./rsvp.ts";

/** The placeholders of the waiting-page texts. */
export const WAITING_PLACEHOLDERS = ["name", "waitingCount", "openingDate"] as const;

/** The three texts, by the guest's RSVP status (`none`: not answered yet). */
export const WAITING_TEXT_KEYS = ["none", "attending", "declined"] as const;
export type WaitingTextKey = (typeof WAITING_TEXT_KEYS)[number];

/** The default texts (sw-architecture.md 10.4), German like the rest of the UI. */
export const DEFAULT_WAITING_TEXTS: Record<WaitingTextKey, string> = {
  none: "Psst, {name} … hinter dieser Tür entsteht gerade etwas. Bevor sie aufgeht, verrate uns: Bist du dabei?",
  attending:
    "Danke, {name}, deine Zusage ist angekommen! Hinter dieser Tür wird gerade gehämmert, gemalt und gepflanzt – für dich und {waitingCount} weitere Gäste. Wir sagen dir Bescheid, sobald die Tür aufgeht.",
  declined:
    "Schade, dass du nicht dabei sein kannst, {name} – danke für deine Antwort! Wenn die Tür aufgeht, darfst du trotzdem einen Blick hineinwerfen.",
};

/** Fills the placeholders; an unknown `{word}` stays as written. */
export function fillWaitingText(
  template: string,
  values: Record<(typeof WAITING_PLACEHOLDERS)[number], string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    (WAITING_PLACEHOLDERS as readonly string[]).includes(key)
      ? values[key as keyof typeof values]
      : match,
  );
}

const textSchema = z.string().trim().min(1).max(1000);

/** `GET /api/admin/waiting`: the settings as the admin edits them. */
export const waitingConfigSchema = z.object({
  /** The announced opening date (ISO instant), shown by `{openingDate}`. */
  openingAt: z.string().nullable(),
  /** Whether the waiting page also shows a countdown to the opening date (ACS-13). */
  countdownEnabled: z.boolean(),
  /** The texts in use: the admin's own, or the default. */
  texts: z.object({ none: z.string(), attending: z.string(), declined: z.string() }),
  /** Which texts the admin has edited (the others are the default). */
  custom: z.object({ none: z.boolean(), attending: z.boolean(), declined: z.boolean() }),
});
export type WaitingConfig = z.infer<typeof waitingConfigSchema>;

/** `PATCH /api/admin/waiting`: what to change; a text of `null` goes back to the default. */
export const waitingUpdateSchema = z
  .strictObject({
    openingAt: z.iso.datetime().nullable().optional(),
    countdownEnabled: z.boolean().optional(),
    texts: z
      .strictObject({
        none: textSchema.nullable().optional(),
        attending: textSchema.nullable().optional(),
        declined: textSchema.nullable().optional(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.openingAt !== undefined ||
      value.countdownEnabled !== undefined ||
      Object.keys(value.texts ?? {}).length > 0,
    { message: "name at least one value to change" },
  );
export type WaitingUpdate = z.infer<typeof waitingUpdateSchema>;

/** `GET /api/waiting`: what the waiting page shows to this guest. */
export const waitingPageSchema = z.object({
  eventName: z.string(),
  /** Whether the platform is open (an open platform has no waiting page for guests). */
  open: z.boolean(),
  status: z.enum(RSVP_STATUSES),
  /** The text for the guest's status, placeholders filled. */
  text: z.string(),
  /** The instant to count down to; null unless the admin switched the countdown on. */
  countdownTo: z.string().nullable(),
  /** Whether the RSVP is available (the feature is on and the guest is a `vip`). */
  rsvp: z.boolean(),
});
export type WaitingPage = z.infer<typeof waitingPageSchema>;

/**
 * `door.json` next to an event's `door.png` (sw-architecture.md 10.4): the sprite sheet holds
 * `frames` equally sized frames side by side; they play in a loop at `fps`. An optional
 * `door-glimpse.png` is shown when the guest taps the `gap` (fractions of the frame).
 */
export const doorSheetSchema = z.strictObject({
  frameWidth: z.number().int().min(16).max(2048),
  frameHeight: z.number().int().min(16).max(2048),
  frames: z.number().int().min(1).max(64),
  fps: z.number().min(0.5).max(30),
  gap: z
    .strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0.01).max(1),
      height: z.number().min(0.01).max(1),
    })
    .optional(),
});
export type DoorSheet = z.infer<typeof doorSheetSchema>;

/** `GET /api/waiting/door`: the built-in scene, or the event's own sprite sheet. */
export const doorResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }),
  z.object({
    kind: z.literal("sheet"),
    sheet: doorSheetSchema,
    /** Whether `door-glimpse.png` exists. */
    glimpse: z.boolean(),
    /** Changes with the files, so a replaced scene is loaded again. */
    version: z.string(),
  }),
]);
export type DoorResponse = z.infer<typeof doorResponseSchema>;
