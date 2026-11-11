import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../config.ts";
import { tempDir } from "../test-support.ts";
import { createMailer } from "./mailer.ts";

const BASE = { DATA_DIR: "/tmp/zappaloo-unused" };

describe("mail configuration", () => {
  it("[ACC-11] sends no email without an SMTP host; empty values count as unset", () => {
    const config = loadConfig({
      ...BASE,
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      MAIL_FROM: "",
    });
    expect(config.SMTP_HOST).toBeUndefined();
    expect(createMailer(config)).toBeUndefined();
  });

  it("[ACC-11] reads host, port, user, password and sender; the password may come from a file", () => {
    const dir = tempDir();
    try {
      const file = join(dir.path, "smtp_password");
      writeFileSync(file, "s3cret\n");
      const config = loadConfig({
        ...BASE,
        SMTP_HOST: "mail.example.org",
        SMTP_PORT: "465",
        SMTP_USER: "zappaloo",
        SMTP_PASSWORD_FILE: file,
        MAIL_FROM: "hello@example.org",
      });
      expect(config).toMatchObject({
        SMTP_HOST: "mail.example.org",
        SMTP_PORT: 465,
        SMTP_USER: "zappaloo",
        SMTP_PASSWORD: "s3cret",
        MAIL_FROM: "hello@example.org",
      });
    } finally {
      dir.remove();
    }
  });

  it("[ACC-11] requires the sender address with a mail server in staging and prod", () => {
    const env = {
      ...BASE,
      APP_ENV: "prod",
      PUBLIC_URL: "https://example.org",
      SESSION_SECRET: "x".repeat(32),
      SMTP_HOST: "mail.example.org",
    };
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, MAIL_FROM: "hello@example.org" })).not.toThrow();
  });

  it("[ACC-11] refuses a login without a password in staging and prod; an empty password file counts as none", () => {
    const dir = tempDir();
    try {
      const empty = join(dir.path, "smtp_password");
      writeFileSync(empty, "");
      const env = {
        ...BASE,
        APP_ENV: "prod",
        PUBLIC_URL: "https://example.org",
        SESSION_SECRET: "x".repeat(32),
        SMTP_HOST: "mail.example.org",
        MAIL_FROM: "hello@example.org",
      };
      expect(() => loadConfig({ ...env, SMTP_USER: "zappaloo" })).toThrow(
        /SMTP_PASSWORD: required with SMTP_USER/,
      );
      expect(() =>
        loadConfig({ ...env, SMTP_USER: "zappaloo", SMTP_PASSWORD_FILE: empty }),
      ).toThrow(/SMTP_PASSWORD: required with SMTP_USER/);
      // Without a login the empty file is fine (the Compose secret always exists).
      expect(loadConfig({ ...env, SMTP_PASSWORD_FILE: empty }).SMTP_PASSWORD).toBeUndefined();
    } finally {
      dir.remove();
    }
  });
});

describe("SMTP mailer", () => {
  let server: SMTPServer | undefined;
  afterEach(async () => {
    const closing = server;
    server = undefined;
    if (closing) {
      await new Promise<void>((resolve) => {
        closing.close(() => {
          resolve();
        });
      });
    }
  });

  it("[ACC-11] delivers a message to the configured server with the configured sender", async () => {
    const received: string[] = [];
    const smtp = new SMTPServer({
      disabledCommands: ["STARTTLS", "AUTH"],
      onData: (stream, _session, callback) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          received.push(Buffer.concat(chunks).toString());
          callback();
        });
      },
    });
    server = smtp;
    await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
    const address = smtp.server.address() as AddressInfo;

    const mailer = createMailer(
      loadConfig({
        ...BASE,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(address.port),
        MAIL_FROM: "hello@example.org",
      }),
    );
    await mailer?.send({ to: "anna@example.org", subject: "Hello", text: "Body text" });

    expect(received).toHaveLength(1);
    expect(received[0]).toContain("From: hello@example.org");
    expect(received[0]).toContain("To: anna@example.org");
    expect(received[0]).toContain("Subject: Hello");
    expect(received[0]).toContain("Body text");
  });
});
