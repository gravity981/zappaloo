// The profile of a person: an optional photo, an optional greeting and "How I know the couple", which others see
// in the speech bubble and the table finder (sw-architecture.md 3.6; PRES-09, PRES-13 – PRES-15). Profiles are not
// moderated (PRES-14); the admin can remove a photo or a line.
import { z } from "zod";

export const PROFILE_LIMITS = {
  /** The one-line greeting, in characters. */
  greeting: 80,
  /** The free line of "How I know the couple", in characters. */
  relationLine: 60,
  /** One option of the admin's list, in characters, and how many options the list may have. */
  relationName: 40,
  relations: 20,
  /** The photo as uploaded, in bytes; the server shrinks it. */
  photoBytes: 10 * 1024 * 1024,
  /** The processed photo is a square of this side, in pixels. */
  photoSide: 256,
} as const;

/** The wedding defaults of the relation list (mock `onboard-profile`); the admin changes them. */
export const DEFAULT_RELATIONS = [
  "Familie Braut",
  "Familie Bräutigam",
  "Freunde Braut",
  "Freunde Bräutigam",
  "Freunde beider",
  "Arbeit",
] as const;

/** An option of "How I know the couple". */
export const relationOptionSchema = z.object({ id: z.number().int(), name: z.string() });
export type RelationOption = z.infer<typeof relationOptionSchema>;

/** A person's profile as the owner (and the admin) sees it. */
export const profilePersonSchema = z.object({
  /** `me` for the guest, the id of an approved companion otherwise (as in `GET /api/avatar`). */
  id: z.string(),
  /** The key of the person in the guest list of the game: `u<user id>` or `c<companion id>`. */
  key: z.string(),
  name: z.string(),
  greeting: z.string().nullable(),
  /** The id of the chosen option of the relation list, if it still exists. */
  relation: z.number().int().nullable(),
  relationLine: z.string().nullable(),
  /** Whether there is a photo, and its version (the time of the last change) for the address. */
  photo: z.number().int().nullable(),
});
export type ProfilePerson = z.infer<typeof profilePersonSchema>;

/** `GET /api/profile/people`: the user and the approved companions with their profiles, and the relation list. */
export const profilePeopleResponseSchema = z.object({
  persons: z.array(profilePersonSchema),
  relations: z.array(relationOptionSchema),
});
export type ProfilePeopleResponse = z.infer<typeof profilePeopleResponseSchema>;

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value));

/** `PUT /api/profile/people/:person`: the three text parts at once; `null` or an empty text clears one. */
export const profileRequestSchema = z.strictObject({
  greeting: optionalLine(PROFILE_LIMITS.greeting),
  relation: z.number().int().nullable(),
  relationLine: optionalLine(PROFILE_LIMITS.relationLine),
});
export type ProfileRequest = z.infer<typeof profileRequestSchema>;

/** `PUT /api/admin/profile/relations`: the whole list; an entry with an `id` keeps it, one without gets a new one. */
export const relationsRequestSchema = z.strictObject({
  relations: z
    .array(
      z.strictObject({
        id: z.number().int().optional(),
        name: z.string().trim().min(1).max(PROFILE_LIMITS.relationName),
      }),
    )
    .min(1)
    .max(PROFILE_LIMITS.relations),
});
export type RelationsRequest = z.infer<typeof relationsRequestSchema>;

/** `GET`/`PUT /api/admin/profile/relations`. */
export const relationsResponseSchema = z.object({ relations: z.array(relationOptionSchema) });
export type RelationsResponse = z.infer<typeof relationsResponseSchema>;

/** The parts of a profile an admin can remove (PRES-14). */
export const PROFILE_REMOVABLE = ["photo", "greeting", "relationLine"] as const;
export type ProfileRemovable = (typeof PROFILE_REMOVABLE)[number];

/** `GET /api/admin/profiles/:user`: the profiles of a guest and their approved companions. */
export const adminProfilesResponseSchema = z.object({ persons: z.array(profilePersonSchema) });
export type AdminProfilesResponse = z.infer<typeof adminProfilesResponseSchema>;
