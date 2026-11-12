// Opening the platform and the privacy notice (sw-architecture.md 10.4, 24; ACS-14, SEC-09):
// the schemas of the admin API and the default text of the privacy notice.
import { z } from "zod";

/** `GET /api/admin/platform`: the state and how many guests an opening email would reach. */
export const platformStatusSchema = z.object({
  open: z.boolean(),
  /** Guests with a verified email address: the count on the button (ACS-14, 7.1.1). */
  recipientCount: z.number().int(),
});
export type PlatformStatus = z.infer<typeof platformStatusSchema>;

/** `POST /api/admin/platform/open`: opens the platform, optionally with the email. */
export const openPlatformRequestSchema = z.strictObject({ sendEmail: z.boolean() });
export type OpenPlatformRequest = z.infer<typeof openPlatformRequestSchema>;
export const openPlatformResponseSchema = z.object({
  /** How many "the door is open" emails were sent. */
  sent: z.number().int(),
  /** How many could not be sent. */
  failed: z.number().int(),
});

/** The longest privacy notice the admin can save. */
export const PRIVACY_MAX_LENGTH = 20000;

/** `GET /api/privacy` (public): the notice, with the placeholder filled. */
export const privacyResponseSchema = z.object({
  eventName: z.string().nullable(),
  markdown: z.string(),
});
export type PrivacyResponse = z.infer<typeof privacyResponseSchema>;

/** `GET /api/admin/privacy`: the notice as the admin edits it. */
export const privacyConfigSchema = z.object({
  /** The text in use: the admin's own, or the default. */
  markdown: z.string(),
  /** Whether the admin has edited it (otherwise it is the default). */
  custom: z.boolean(),
});
export type PrivacyConfig = z.infer<typeof privacyConfigSchema>;

/** `PUT /api/admin/privacy`: a new text, or `null` for the default. */
export const privacyUpdateSchema = z.strictObject({
  markdown: z.string().trim().min(1).max(PRIVACY_MAX_LENGTH).nullable(),
});
export type PrivacyUpdate = z.infer<typeof privacyUpdateSchema>;

/**
 * The default privacy notice (24): German, written for guests of a private event. `{eventName}`
 * is replaced by the name of the event. A draft: it needs a legal review before production use
 * (sw-architecture.md 24), and the admin can edit it in Einstellungen.
 */
export const DEFAULT_PRIVACY_NOTICE = `# Datenschutz

Diese Seite gehört zum Fest «{eventName}». Wir speichern nur, was wir dafür brauchen, und geben nichts an Dritte weiter.

## Was wir speichern

- **Dein Konto:** Benutzername, Anzeigename und dein Passwort (nur verschlüsselt, wir können es nicht lesen). Eine E-Mail-Adresse speichern wir nur, wenn du sie angibst.
- **Deine Rückmeldung:** für welche Programmpunkte des Festes du zu- oder absagst, dein Menü, ein Songwunsch, falls danach gefragt wird, und die Personen, die du mitbringst (Name und ihre Angaben).
- **Allergien und Unverträglichkeiten:** Das sind Gesundheitsdaten und deshalb besonders schützenswert. Sie dienen nur der Planung des Essens. Nur die Administratoren sehen sie, weder andere Gäste noch Helferinnen und Helfer.
- **Beiträge:** Fotos und Texte, die du später hochlädst oder schreibst, sobald diese Funktionen freigeschaltet sind.
- **Technisches:** ein Cookie, damit du angemeldet bleibst. Wir setzen keine Werbe- oder Analyse-Dienste ein.

## Wozu

Damit die Gastgeber das Fest planen können (Essen, Plätze, Einladungen), damit du dich anmelden kannst und damit du Erinnerungen am Fest teilen kannst. E-Mails schicken wir nur, wenn du eine bestätigte Adresse hinterlegt hast, zum Beispiel für das Zurücksetzen des Passworts oder wenn die Tür aufgeht.

## Wer sieht was

Deine Rückmeldung sehen die Administratoren. Andere Gäste sehen nur, was du selbst in der Spielwelt zeigst. Die Seite ist für Suchmaschinen gesperrt.

## Löschen

Du kannst dein Konto jederzeit im Profil löschen. Deine Rückmeldung (mit Begleitpersonen und Allergien) bleibt für die Organisation bei den Gastgebern; wenn du sie auch gelöscht haben willst, schreib ihnen. Nach dem Fest löschen wir alle persönlichen Daten.

## Fragen

Melde dich bei den Gastgebern von «{eventName}».
`;

/** Fills `{eventName}` in the privacy notice; without a name the text says "dieses Fest". */
export function fillPrivacyNotice(markdown: string, eventName: string | null): string {
  return markdown.replaceAll("{eventName}", eventName ?? "dieses Fest");
}
