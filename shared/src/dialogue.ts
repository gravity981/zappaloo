// The dialogues of the game world (sw-architecture.md 6.2, 14.4; CNT-02, CNT-03, CNT-08): the name of an NPC and lines
// in Markdown that the guest taps through, with an optional portrait. The admin edits them in Erlebniswelt › Dialoge;
// a clickable object with the action `dialog` shows one.
import { z } from "zod";

export const DIALOGUE_LIMITS = {
  /** The id (the `contentId` of Tiled presets): `a–z 0–9 -`, in characters. */
  id: 40,
  npcName: 60,
  /** How many lines, and the length of one in characters. */
  lines: 30,
  line: 500,
  /** The portrait as uploaded: bytes and pixels per side (CNT-08). */
  portraitBytes: 1024 * 1024,
  portraitSide: 512,
} as const;

export const DIALOGUE_ID_PATTERN = /^[a-z0-9-]+$/;

/** The object of a map that shows a dialogue. */
export const dialogueUseSchema = z.object({
  map: z.string(),
  mapName: z.string().nullable(),
  object: z.string(),
  label: z.string().nullable(),
});
export type DialogueUse = z.infer<typeof dialogueUseSchema>;

/** `POST /api/admin/dialogues` and `PUT /api/admin/dialogues/:id`: a dialogue without its portrait. */
export const dialogueRequestSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(DIALOGUE_LIMITS.id)
    .regex(DIALOGUE_ID_PATTERN, "1–40 characters of a–z, 0–9 and -"),
  npcName: z.string().trim().min(1).max(DIALOGUE_LIMITS.npcName),
  lines: z
    .array(z.string().trim().min(1).max(DIALOGUE_LIMITS.line))
    .min(1)
    .max(DIALOGUE_LIMITS.lines),
});
export type DialogueRequest = z.infer<typeof dialogueRequestSchema>;

/** One dialogue as the admin's list shows it. */
export const dialogueSummarySchema = z.object({
  id: z.string(),
  npcName: z.string(),
  lines: z.number().int(),
  portrait: z.boolean(),
  /** The objects that show it; empty while it is not used. */
  usedBy: z.array(dialogueUseSchema),
});
export type DialogueSummary = z.infer<typeof dialogueSummarySchema>;

/** `GET /api/admin/dialogues`. */
export const dialoguesResponseSchema = z.object({ dialogues: z.array(dialogueSummarySchema) });
export type DialoguesResponse = z.infer<typeof dialoguesResponseSchema>;

/** One dialogue for the editor: everything but the picture itself, whose version is the address of it. */
export const dialogueDetailSchema = z.object({
  id: z.string(),
  npcName: z.string(),
  lines: z.array(z.string()),
  /** The version of the portrait for its address, or null without one. */
  portrait: z.number().int().nullable(),
  usedBy: z.array(dialogueUseSchema),
});
export type DialogueDetail = z.infer<typeof dialogueDetailSchema>;

/** `GET /api/dialogues/:id`: what the game shows (CNT-02): the NPC, its lines and the portrait's version. */
export const dialogueGuestSchema = z.object({
  id: z.string(),
  npcName: z.string(),
  lines: z.array(z.string()),
  portrait: z.number().int().nullable(),
});
export type DialogueGuest = z.infer<typeof dialogueGuestSchema>;
