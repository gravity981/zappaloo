// Opening and closing the platform (ACS-10, ACS-14) and the privacy notice (SEC-09;
// sw-architecture.md 10.4, 24).
import { and, eq } from "drizzle-orm";
import { DEFAULT_PRIVACY_NOTICE, fillPrivacyNotice } from "@zappaloo/shared";
import type { PlatformStatus, PrivacyConfig, PrivacyResponse } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { eventSettings, membershipRoles, privacyNotice, users } from "../database/schema.ts";
import type { Mailer } from "../mail/mailer.ts";
import { doorOpenMail } from "../mail/templates.ts";
import type { Actor, EventService } from "./service.ts";

export class PlatformError extends Error {
  override name = "PlatformError";
  /** `already_open` and `already_closed` are answered with 409. */
  readonly code: "already_open" | "already_closed" | "mail_unavailable";
  constructor(code: PlatformError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export class PlatformService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #mailer: Mailer | undefined;
  readonly #publicUrl: string;

  constructor(
    database: Database,
    event: EventService,
    mailer: Mailer | undefined,
    publicUrl: string,
  ) {
    this.#database = database;
    this.#event = event;
    this.#mailer = mailer;
    this.#publicUrl = publicUrl;
  }

  /** Guests (`vip`) with a verified address: the ones "the door is open" reaches (7.1.1). */
  recipients(): { name: string; email: string }[] {
    return this.#database.db
      .select({
        name: users.displayName,
        email: users.email,
        status: users.emailStatus,
      })
      .from(users)
      .innerJoin(membershipRoles, eq(membershipRoles.userId, users.id))
      .where(
        and(
          eq(membershipRoles.eventId, this.#event.eventId),
          eq(membershipRoles.role, "vip"),
          eq(users.emailStatus, "verified"),
        ),
      )
      .orderBy(users.id)
      .all()
      .flatMap((row) => (row.email ? [{ name: row.name, email: row.email }] : []));
  }

  status(): PlatformStatus {
    return {
      open: this.#event.settings().platformOpen,
      recipientCount: this.recipients().length,
    };
  }

  #set(open: boolean, action: "platform.open" | "platform.close", actor: Actor, details = {}) {
    this.#database.db.transaction((tx) => {
      const current = this.#event.settings().platformOpen;
      if (current === open) {
        throw new PlatformError(
          open ? "already_open" : "already_closed",
          open ? "the platform is open already" : "the platform is closed already",
        );
      }
      tx.update(eventSettings)
        .set({ value: open })
        .where(
          and(
            eq(eventSettings.eventId, this.#event.eventId),
            eq(eventSettings.name, "platformOpen"),
          ),
        )
        .run();
      this.#event.audit(actor, action, details, tx);
    });
  }

  /**
   * Opens the platform for guests; with `sendEmail` it also sends every guest with a verified
   * address "the door is open" (ACS-14). The platform is open as soon as the switch is set, a
   * mail that fails does not undo it: the answer says how many were sent and how many failed.
   */
  async open(
    sendEmail: boolean,
    actor: Actor,
    log: (error: unknown) => void,
  ): Promise<{ sent: number; failed: number }> {
    if (sendEmail && !this.#mailer) {
      throw new PlatformError("mail_unavailable", "this installation cannot send email");
    }
    this.#set(true, "platform.open", actor, { email: sendEmail });
    if (!sendEmail || !this.#mailer) return { sent: 0, failed: 0 };
    const eventName = this.#event.get().name ?? "Zappaloo";
    const url = `${this.#publicUrl.replace(/\/+$/, "")}/login`;
    let sent = 0;
    let failed = 0;
    for (const recipient of this.recipients()) {
      try {
        await this.#mailer.send(doorOpenMail(recipient.email, eventName, recipient.name, url));
        sent += 1;
      } catch (error) {
        failed += 1;
        log(error);
      }
    }
    this.#event.audit(actor, "platform.open_mail", { sent, failed });
    return { sent, failed };
  }

  /** Closes the platform again; no email is sent (10.4). */
  close(actor: Actor): void {
    this.#set(false, "platform.close", actor);
  }

  // --- Privacy notice -------------------------------------------------------------------------

  /** The admin's text, or the default. */
  privacyConfig(): PrivacyConfig {
    const row = this.#database.db
      .select()
      .from(privacyNotice)
      .where(eq(privacyNotice.eventId, this.#event.eventId))
      .get();
    return { markdown: row?.markdown ?? DEFAULT_PRIVACY_NOTICE, custom: row !== undefined };
  }

  /** The notice as everyone reads it: the placeholder filled with the event's name. */
  privacy(): PrivacyResponse {
    const eventName = this.#event.get().name;
    return {
      eventName,
      markdown: fillPrivacyNotice(this.privacyConfig().markdown, eventName),
    };
  }

  /** Saves the admin's text, or goes back to the default with `null`. Audited without the text. */
  setPrivacy(markdown: string | null, actor: Actor): PrivacyConfig {
    this.#database.db.transaction((tx) => {
      if (markdown === null) {
        tx.delete(privacyNotice).where(eq(privacyNotice.eventId, this.#event.eventId)).run();
      } else {
        tx.insert(privacyNotice)
          .values({ eventId: this.#event.eventId, markdown, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: privacyNotice.eventId,
            set: { markdown, updatedAt: new Date() },
          })
          .run();
      }
      this.#event.audit(actor, "privacy.set", { reset: markdown === null }, tx);
    });
    return this.privacyConfig();
  }
}
