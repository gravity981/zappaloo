// Sending email through the SMTP server of the installation (ACC-11,
// sw-architecture.md 7.1). The rest of the application only sees `Mailer`, so tests
// collect the messages instead of sending them.
import { createTransport } from "nodemailer";
import type { Config } from "../config.ts";

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text; the emails carry no HTML. */
  text: string;
}

export interface Mailer {
  send: (message: MailMessage) => Promise<void>;
}

type SmtpConfig = Pick<
  Config,
  "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASSWORD" | "MAIL_FROM"
>;

/** The SMTP mailer of the configuration; undefined if no SMTP_HOST is set (no email is sent). */
export function createMailer(config: SmtpConfig): Mailer | undefined {
  if (config.SMTP_HOST === undefined) return undefined;
  const port = config.SMTP_PORT ?? 587;
  const secure = port === 465;
  const transport = createTransport({
    host: config.SMTP_HOST,
    port,
    secure,
    // A login never travels unencrypted.
    requireTLS: config.SMTP_USER !== undefined && !secure,
    ...(config.SMTP_USER !== undefined
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? "" } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    send: async (message) => {
      await transport.sendMail({ from: config.MAIL_FROM, ...message });
    },
  };
}

/** Collects the messages instead of sending them (tests). */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failWith: Error | undefined;

  send(message: MailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(message);
    return Promise.resolve();
  }
}
