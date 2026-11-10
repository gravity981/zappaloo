// Runtime configuration from environment variables, validated at startup.
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { eventSlugSchema } from "@zappaloo/shared";

/** The `events/` folder of the application: next to `backend/` in the repository and in the image. */
export const BUNDLED_EVENTS_DIR = fileURLToPath(new URL("../../events", import.meta.url));

/** Event used when EVENT_SLUG is not set (dev and test only). */
export const EXAMPLE_EVENT = "event-muster";

const configSchema = z
  .object({
    APP_ENV: z.enum(["dev", "test", "staging", "prod"]).default("dev"),
    /** Persistent data: SQLite database, uploads, imported maps (sw-architecture.md 22.1). */
    DATA_DIR: z.string().min(1),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    /** Built frontend (frontend/dist), served by the backend; unset in dev (Vite serves it). */
    FRONTEND_DIR: z.string().min(1).optional(),
    /** Baked into the image at build time (sw-architecture.md 23.6); unset when running from source. */
    APP_VERSION: z.string().min(1).optional(),
    APP_VERSION_SUFFIX: z.string().optional(),
    APP_COMMIT: z.string().min(1).optional(),
    /**
     * The event of this installation: `events/<slug>/`, first in $DATA_DIR/events, then in the
     * application (sw-architecture.md 19.3.1). Required in staging and prod, so a real
     * installation never starts with the example event by accident.
     */
    EVENT_SLUG: z.string().min(1).optional(),
    /** Replaces the application's `events/` folder (tests). */
    EVENTS_DIR: z.string().min(1).default(BUNDLED_EVENTS_DIR),
  })
  .superRefine((value, context) => {
    if (
      value.EVENT_SLUG === undefined &&
      (value.APP_ENV === "staging" || value.APP_ENV === "prod")
    ) {
      context.addIssue({
        code: "custom",
        path: ["EVENT_SLUG"],
        message: `required in ${value.APP_ENV}: the folder name of the event, e.g. ${EXAMPLE_EVENT}`,
      });
    }
    if (value.EVENT_SLUG !== undefined) {
      const slug = eventSlugSchema.safeParse(value.EVENT_SLUG);
      if (!slug.success) {
        context.addIssue({
          code: "custom",
          path: ["EVENT_SLUG"],
          message: slug.error.issues[0]?.message ?? "is invalid",
        });
      }
    }
  })
  .transform((value) => ({ ...value, EVENT_SLUG: value.EVENT_SLUG ?? EXAMPLE_EVENT }));

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  return result.data;
}
