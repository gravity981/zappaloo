// Drizzle schema of the application database. Tables are added with the
// features that need them; every change is followed by
// `npm run db:generate -w backend`, which writes a new migration (DATA-04).
//
// Every event-related table carries an `event_id` that references `events`
// (DATA-02); a test checks this for every table, so a table added later cannot
// forget it.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** The event of this installation (sw-architecture.md 19.3.1). `id` is the `id` of event.json. */
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  defaultLanguage: text("default_language").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Feature toggles (CFG-03), changeable at runtime. */
export const eventFeatures = sqliteTable(
  "event_features",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.name] })],
);

/** Event settings (CFG-05), changeable at runtime. */
export const eventSettings = sqliteTable(
  "event_settings",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    value: integer("value", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.name] })],
);

/** Administrative actions: who, what, when (DATA-03). */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    /** "cli", later "user:<id>". */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    /** JSON object with the details of the action. */
    details: text("details").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("audit_log_event_time").on(table.eventId, table.createdAt)],
);

// --- Accounts and sessions (sw-architecture.md 7.1.1) ----------------------------
// Accounts, sessions and links belong to a person, not to an event: they carry no
// event_id. Only the event membership and its roles do (DATA-02).

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Login name, lower case, never changes. */
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  emailStatus: text("email_status", { enum: ["unverified", "verified"] })
    .notNull()
    .default("unverified"),
  /** argon2id hash string; null until the owner sets a password with a one-time link. */
  passwordHash: text("password_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** A user's membership of an event; the roles are in `membership_roles`. */
export const memberships = sqliteTable(
  "memberships",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId] })],
);

/** Roles `vip`, `staff`, `admin` of a membership; combinable (sw-architecture.md 8). */
export const membershipRoles = sqliteTable(
  "membership_roles",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["vip", "staff", "admin"] }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId, table.role] })],
);

/** Server-side sessions; only the SHA-256 of the cookie's token is stored. */
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("sessions_user").on(table.userId)],
);

/** One-time setup, reset and email verification links; only the SHA-256 of the token is stored. */
export const oneTimeLinks = sqliteTable(
  "one_time_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["setup", "reset", "verify"] }).notNull(),
    /** For `verify`: the address the link confirms; it counts only while the profile still has it. */
    email: text("email"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("one_time_links_user").on(table.userId)],
);

// --- Staff capabilities and guest groups (sw-architecture.md 8, 12) ----------------

/** The fixed capabilities of a staff member; an admin switches them on per member (ROLE-06). */
export const membershipCapabilities = sqliteTable(
  "membership_capabilities",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capability: text("capability", {
      enum: ["editWebsiteContent", "moderateContributions"],
    }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId, table.capability] })],
);

/** Guest groups: family, friends, … Independent of roles (GRP-01). */
export const guestGroups = sqliteTable(
  "guest_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    /** The name in lower case: names are unique per event regardless of case. */
    nameKey: text("name_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("guest_groups_name").on(table.eventId, table.nameKey)],
);

export const guestGroupMembers = sqliteTable(
  "guest_group_members",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    groupId: integer("group_id")
      .notNull()
      .references(() => guestGroups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("guest_group_members_user").on(table.userId),
  ],
);
