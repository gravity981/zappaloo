// Builds the auth services of an installation from its database, event and configuration.
import type { AuthOptions } from "../api/auth.ts";
import type { Config } from "../config.ts";
import type { Database } from "../database/database.ts";
import type { EventService } from "../event/service.ts";
import type { Mailer } from "../mail/mailer.ts";
import { AccountService } from "./accounts.ts";
import { GroupService } from "./groups.ts";
import { AccessService } from "./access.ts";
import { ActivityService } from "../event/activity.ts";
import { RsvpService } from "../rsvp/service.ts";
import { WaitingService } from "../waiting/service.ts";
import { FooterService } from "../event/footer.ts";
import { PlatformService } from "../event/platform.ts";
import { DEFAULT_SOURCE_URL } from "../config.ts";
import { InvitationService } from "./invitations.ts";
import { RateLimiter } from "./rate-limit.ts";
import { SessionService } from "./sessions.ts";

const HOUSEKEEPING_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes expired sessions and used or expired one-time links now and once a day, so the
 * tables do not grow and no address is kept longer than needed (SEC-04). Returns a stop function.
 */
export function startHousekeeping(
  auth: Pick<AuthOptions, "accounts" | "sessions">,
  log: (details: { sessions: number; links: number }) => void,
): () => void {
  const run = () => {
    log({ sessions: auth.sessions.purgeExpired(), links: auth.accounts.purgeLinks() });
  };
  run();
  const timer = setInterval(run, HOUSEKEEPING_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}

export function createAuth(
  database: Database,
  event: EventService,
  config: Pick<Config, "SESSION_SECRET" | "SECURE_COOKIES" | "PUBLIC_URL"> &
    Partial<Pick<Config, "SOURCE_URL">>,
  mailer?: Mailer,
  /** `$DATA_DIR/events`: where an event's own door scene is (default: none). */
  eventsDir = "",
): AuthOptions {
  const accounts = new AccountService(database, event);
  const groups = new GroupService(database, event);
  const rsvp = new RsvpService(database, event);
  return {
    accounts,
    sessions: new SessionService(database),
    groups,
    access: new AccessService(database, event, groups),
    invitations: new InvitationService(database, event, accounts),
    rsvp,
    platform: new PlatformService(database, event, mailer, config.PUBLIC_URL),
    waiting: new WaitingService(database, event, rsvp, eventsDir),
    footer: new FooterService(database, event, config.SOURCE_URL ?? DEFAULT_SOURCE_URL),
    activity: new ActivityService(database, event),
    limiter: new RateLimiter(),
    event,
    secret: config.SESSION_SECRET,
    secureCookies: config.SECURE_COOKIES,
    publicUrl: config.PUBLIC_URL,
    mailer,
  };
}
