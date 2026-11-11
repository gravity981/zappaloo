// The texts of the emails (sw-architecture.md 7.1). Plain text, German like the
// frontend for now; the sender is the event, so guests know where the mail comes from.
import type { MailMessage } from "./mailer.ts";

export function verificationMail(
  to: string,
  eventName: string,
  url: string,
  validHours: number,
): MailMessage {
  return {
    to,
    subject: `${eventName}: E-Mail-Adresse bestätigen`,
    text:
      `Hallo\n\nBitte bestätige mit diesem Link deine E-Mail-Adresse für ${eventName}:\n\n${url}\n\n` +
      `Der Link ist ${String(validHours)} Stunden gültig und funktioniert nur einmal. ` +
      "Falls du das nicht angefordert hast, kannst du diese Nachricht ignorieren.\n",
  };
}

export function passwordResetMail(
  to: string,
  eventName: string,
  username: string,
  url: string,
  validHours: number,
): MailMessage {
  return {
    to,
    subject: `${eventName}: Passwort zurücksetzen`,
    text:
      `Hallo\n\nFür das Konto "${username}" bei ${eventName} wurde ein neues Passwort angefordert. ` +
      `Du kannst es mit diesem Link festlegen:\n\n${url}\n\n` +
      `Der Link ist ${String(validHours)} Stunden gültig und funktioniert nur einmal. ` +
      "Falls du das nicht angefordert hast, kannst du diese Nachricht ignorieren; dein Passwort bleibt unverändert.\n",
  };
}

export function rsvpReminderMail(
  to: string,
  eventName: string,
  name: string,
  deadline: string | null,
  url: string,
): MailMessage {
  const until = deadline === null ? "" : ` Du kannst bis zum ${deadline} antworten.`;
  return {
    to,
    subject: `${eventName}: Bitte gib uns deine Rückmeldung`,
    text:
      `Hallo ${name}\n\nWir haben noch keine Rückmeldung von dir für ${eventName}. ` +
      `Sag uns bitte, ob du dabei bist.${until}\n\n${url}\n`,
  };
}
