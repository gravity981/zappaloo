// Runtime configuration from environment variables, validated at startup.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

/** An unset variable and an empty one (Compose passes `${VAR:-}`) both mean "not configured". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

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
    /** Signs the session cookies (sw-architecture.md 7.1.1); or read from SESSION_SECRET_FILE. */
    SESSION_SECRET: z.string().optional(),
    SESSION_SECRET_FILE: z.string().min(1).optional(),
    /**
     * Address of the site, in the links the CLI and the admin hand out. Only its origin is kept,
     * so the default port disappears (`https://example.org:443` gives `https://example.org`).
     */
    PUBLIC_URL: z.url().optional(),
    /** Mail server (ACC-11); without it no email is sent. Mailpit in dev, staging and tests. */
    SMTP_HOST: optional(z.string().min(1)),
    /** Default 587. 465 uses TLS from the start; otherwise STARTTLS, required when a login is used. */
    SMTP_PORT: optional(z.coerce.number().int().min(1).max(65535)),
    SMTP_USER: optional(z.string().min(1)),
    /** Or read from SMTP_PASSWORD_FILE (`secrets/smtp_password`). */
    SMTP_PASSWORD: optional(z.string().min(1)),
    SMTP_PASSWORD_FILE: optional(z.string().min(1)),
    /** Sender address of all emails; required with SMTP_HOST in staging and prod. */
    MAIL_FROM: optional(z.email()),
    /** Trust X-Forwarded-For (Caddy is the only way in): for the client address of rate limits. */
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((value, context) => {
    if (
      value.PUBLIC_URL === undefined &&
      (value.APP_ENV === "staging" || value.APP_ENV === "prod")
    ) {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_URL"],
        message: `required in ${value.APP_ENV}: the address of the site, e.g. https://example.org`,
      });
    }
    if (
      value.SMTP_HOST !== undefined &&
      value.MAIL_FROM === undefined &&
      (value.APP_ENV === "staging" || value.APP_ENV === "prod")
    ) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_FROM"],
        message: "required with SMTP_HOST: the sender address of the emails",
      });
    }
  })
  .transform((value) => ({
    ...value,
    PUBLIC_URL: new URL(value.PUBLIC_URL ?? "http://localhost:5173").origin,
    MAIL_FROM: value.MAIL_FROM ?? "zappaloo@localhost",
  }));

type ParsedConfig = z.infer<typeof configSchema>;
export type Config = Omit<
  ParsedConfig,
  "SESSION_SECRET" | "SESSION_SECRET_FILE" | "SMTP_PASSWORD" | "SMTP_PASSWORD_FILE"
> & {
  /** From SMTP_PASSWORD or SMTP_PASSWORD_FILE; undefined for a server without login. */
  SMTP_PASSWORD: string | undefined;
  /** At least 32 characters; random per process in dev and test when not configured. */
  SESSION_SECRET: string;
  /** Session cookies only travel over HTTPS in staging and prod. */
  SECURE_COOKIES: boolean;
};

const SESSION_SECRET_MIN_LENGTH = 32;

function resolveSessionSecret(parsed: ParsedConfig): string {
  let secret = parsed.SESSION_SECRET;
  if (secret === undefined && parsed.SESSION_SECRET_FILE !== undefined) {
    try {
      secret = readFileSync(parsed.SESSION_SECRET_FILE, "utf8").trim();
    } catch {
      throw new ConfigError(
        `invalid configuration:\n  SESSION_SECRET_FILE: cannot read ${parsed.SESSION_SECRET_FILE}`,
      );
    }
  }
  if (secret === undefined) {
    if (parsed.APP_ENV === "staging" || parsed.APP_ENV === "prod") {
      throw new ConfigError(
        `invalid configuration:\n  SESSION_SECRET: required in ${parsed.APP_ENV} (or SESSION_SECRET_FILE)`,
      );
    }
    // Sessions do not survive a restart without a configured secret: fine in dev and test.
    return randomBytes(32).toString("hex");
  }
  if (secret.length < SESSION_SECRET_MIN_LENGTH) {
    throw new ConfigError(
      `invalid configuration:\n  SESSION_SECRET: must have at least ${String(SESSION_SECRET_MIN_LENGTH)} characters`,
    );
  }
  return secret;
}

function resolveSmtpPassword(parsed: ParsedConfig): string | undefined {
  if (parsed.SMTP_PASSWORD !== undefined || parsed.SMTP_PASSWORD_FILE === undefined) {
    return parsed.SMTP_PASSWORD;
  }
  try {
    return readFileSync(parsed.SMTP_PASSWORD_FILE, "utf8").trim() || undefined;
  } catch {
    throw new ConfigError(
      `invalid configuration:\n  SMTP_PASSWORD_FILE: cannot read ${parsed.SMTP_PASSWORD_FILE}`,
    );
  }
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  const smtpPassword = resolveSmtpPassword(result.data);
  const deployed = result.data.APP_ENV === "staging" || result.data.APP_ENV === "prod";
  if (deployed && result.data.SMTP_USER !== undefined && smtpPassword === undefined) {
    // A login without a password would fail on every email, silently (7.1.1).
    throw new ConfigError(
      `invalid configuration:\n  SMTP_PASSWORD: required with SMTP_USER in ${result.data.APP_ENV} (or SMTP_PASSWORD_FILE)`,
    );
  }
  return {
    ...result.data,
    SESSION_SECRET: resolveSessionSecret(result.data),
    SMTP_PASSWORD: smtpPassword,
    SECURE_COOKIES: result.data.APP_ENV === "staging" || result.data.APP_ENV === "prod",
  };
}
