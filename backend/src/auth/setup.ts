// Builds the auth services of an installation from its database, event and configuration.
import type { AuthOptions } from "../api/auth.ts";
import type { Config } from "../config.ts";
import type { Database } from "../database/database.ts";
import type { EventService } from "../event/service.ts";
import { AccountService } from "./accounts.ts";
import { RateLimiter } from "./rate-limit.ts";
import { SessionService } from "./sessions.ts";

export function createAuth(
  database: Database,
  event: EventService,
  config: Pick<Config, "SESSION_SECRET" | "SECURE_COOKIES" | "PUBLIC_URL">,
): AuthOptions {
  return {
    accounts: new AccountService(database, event),
    sessions: new SessionService(database),
    limiter: new RateLimiter(),
    event,
    secret: config.SESSION_SECRET,
    secureCookies: config.SECURE_COOKIES,
    publicUrl: config.PUBLIC_URL,
  };
}
