// Runtime configuration from environment variables, validated at startup.
import { z } from "zod";

const configSchema = z.object({
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
});

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
