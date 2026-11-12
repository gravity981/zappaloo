// Drizzle schema of the application database. Tables are added with the
// features that need them; every change is followed by
// `npm run db:generate -w backend`, which writes a new migration (DATA-04).
// The migrations of stages 1 and 2 were squashed into one before the first release with
// a database (2026-11-10); released migrations are never changed (migration check).
//
// Every event-related table carries an `event_id` that references `events`
// (DATA-02); a test checks this for every table, so a table added later cannot
// forget it.
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * The event of this installation (sw-architecture.md 19.3.1). Name, time zone and default
 * language are empty until the admin has completed the setup.
 */
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  name: text("name"),
  timezone: text("timezone"),
  defaultLanguage: text("default_language"),
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
    /** "cli", "user:<id>" or "anonymous" (a request without sign-in). */
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

export const users = sqliteTable(
  "users",
  {
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
  },
  (table) => [
    // An address can be verified by one account only (ACC-16); unverified ones may repeat.
    uniqueIndex("users_verified_email")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.emailStatus} = 'verified'`),
  ],
);

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
    /** How `vip` was granted (INV-11); null without the role. Cleared when vip is revoked. */
    vipAssignment: text("vip_assignment", { enum: ["invitation_code", "admin_promotion"] }),
    /** For `invitation_code`: the invitation that was redeemed. */
    vipInvitationId: integer("vip_invitation_id").references(
      (): AnySQLiteColumn => invitations.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId] })],
);

/** Roles, capabilities and group memberships belong to a membership and go with it. */
const ofMembership = (table: { eventId: AnySQLiteColumn; userId: AnySQLiteColumn }) =>
  foreignKey({
    columns: [table.eventId, table.userId],
    foreignColumns: [memberships.eventId, memberships.userId],
  }).onDelete("cascade");

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
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId, table.role] }),
    ofMembership(table),
  ],
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
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId, table.capability] }),
    ofMembership(table),
  ],
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
  (table) => [
    uniqueIndex("guest_groups_name").on(table.eventId, table.nameKey),
    // Lets a member row reference the group together with its event.
    uniqueIndex("guest_groups_event").on(table.id, table.eventId),
  ],
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
    // The member's event is the group's event, and the member belongs to it.
    foreignKey({
      columns: [table.groupId, table.eventId],
      foreignColumns: [guestGroups.id, guestGroups.eventId],
    }).onDelete("cascade"),
    ofMembership(table),
  ],
);

// --- Invitations (sw-architecture.md 9) ---------------------------------------------

/**
 * Personal invitation codes (INV-01 – INV-06). Only the SHA-256 of the code is stored (INV-02).
 * `status` holds what happened to the code; `expired` is not stored but derived from
 * `expires_at`, so a clock never has to flip a row.
 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    /** Whom the card is for; suggested as the display name at redemption. */
    guestName: text("guest_name").notNull(),
    note: text("note"),
    codeHash: text("code_hash").notNull().unique(),
    status: text("status", { enum: ["active", "redeemed", "revoked", "replaced"] })
      .notNull()
      .default("active"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
    /** Null again if the account is deleted; the code stays recorded as redeemed (INV-10). */
    redeemedBy: integer("redeemed_by").references(() => users.id, { onDelete: "set null" }),
    /** For a `replaced` code: the code that took its place. */
    replacedBy: integer("replaced_by").references((): AnySQLiteColumn => invitations.id),
  },
  (table) => [index("invitations_event").on(table.eventId)],
);

// --- Access conditions (sw-architecture.md 11) ----------------------------------------

/** Manual releases an admin has switched on; a `release` condition is true while its key is here. */
export const accessReleases = sqliteTable(
  "access_releases",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    key: text("key").notNull(),
    releasedAt: integer("released_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.key] })],
);

// --- RSVP (sw-architecture.md 7.4, 7.4.1) -------------------------------------------------

/** Program items: ceremony, aperitif, dinner, party (RSVP-02). At most one has the meal. */
export const programItems = sqliteTable(
  "program_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    place: text("place"),
    hasMeal: integer("has_meal", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("program_items_event").on(table.eventId),
    uniqueIndex("program_items_meal")
      .on(table.eventId)
      .where(sql`${table.hasMeal} = 1`),
  ],
);

/** The one list of menu options for everyone (RSVP-03). */
export const menuOptions = sqliteTable(
  "menu_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("menu_options_event").on(table.eventId)],
);

/** RSVP settings of the event; for now the deadline (RSVP-04). */
export const rsvpConfig = sqliteTable("rsvp_config", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id),
  /** The last day guests can change their RSVP, as `YYYY-MM-DD` in the event's time zone. */
  deadline: text("deadline"),
  /** Whether the RSVP asks for a song wish (RSVP-06); the admin switches it. */
  songEnabled: integer("song_enabled", { mode: "boolean" }).notNull().default(true),
  /** Yes or no per program item (RSVP-11); off: one answer per person, stored for every item. */
  perItem: integer("per_item", { mode: "boolean" }).notNull().default(false),
  /** Whether an added accompanying person waits for the admin's approval (RSVP-12). */
  companionApproval: integer("companion_approval", { mode: "boolean" }).notNull().default(false),
});

/** The program items an invitation is for; copied to the membership when the code is redeemed. */
export const invitationProgramItems = sqliteTable(
  "invitation_program_items",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    invitationId: integer("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    programItemId: integer("program_item_id")
      .notNull()
      .references(() => programItems.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.invitationId, table.programItemId] })],
);

/** The program items a `vip` is invited to (RSVP-02). */
export const membershipProgramItems = sqliteTable(
  "membership_program_items",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programItemId: integer("program_item_id")
      .notNull()
      .references(() => programItems.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId, table.programItemId] }),
    ofMembership(table),
  ],
);

/** The RSVP of a guest: one row once they have answered (RSVP-01, RSVP-03, RSVP-06). */
export const rsvpAnswers = sqliteTable(
  "rsvp_answers",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    menuId: integer("menu_id").references(() => menuOptions.id, { onDelete: "set null" }),
    /** Health data: only admins read it (SEC-11). */
    allergies: text("allergies"),
    songWish: text("song_wish"),
    answeredAt: integer("answered_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId] }), ofMembership(table)],
);

/** Yes or no per invited program item (RSVP-01). */
export const rsvpAttendance = sqliteTable(
  "rsvp_attendance",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programItemId: integer("program_item_id")
      .notNull()
      .references(() => programItems.id, { onDelete: "cascade" }),
    attending: integer("attending", { mode: "boolean" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId, table.programItemId] }),
    ofMembership(table),
  ],
);

// --- Accompanying persons (sw-architecture.md 7.4, 7.4.1; RSVP-08 – RSVP-10) ---------------

/**
 * A person a guest asks to bring: no account, the guest manages the data. The guest's own
 * membership owns the row, so it goes when the guest's account is deleted (RSVP-09).
 */
export const companions = sqliteTable(
  "companions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    hostUserId: integer("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** An optional note for the admin, e.g. "my daughter, 6" (RSVP-10). */
    note: text("note"),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    menuId: integer("menu_id").references(() => menuOptions.id, { onDelete: "set null" }),
    /** Health data: only admins and the guest read it (SEC-11). */
    allergies: text("allergies"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("companions_host").on(table.hostUserId),
    foreignKey({
      columns: [table.eventId, table.hostUserId],
      foreignColumns: [memberships.eventId, memberships.userId],
    }).onDelete("cascade"),
  ],
);

/** Yes or no per program item for a companion, for the program items the guest is invited to. */
export const companionAttendance = sqliteTable(
  "companion_attendance",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    companionId: integer("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    programItemId: integer("program_item_id")
      .notNull()
      .references(() => programItems.id, { onDelete: "cascade" }),
    attending: integer("attending", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.companionId, table.programItemId] })],
);

// --- Waiting page (sw-architecture.md 10.4; ACS-11, ACS-13) -------------------------------

/** The waiting page's settings: opening date, countdown switch and the admin's own texts. */
export const waitingConfig = sqliteTable("waiting_config", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id),
  openingAt: integer("opening_at", { mode: "timestamp_ms" }),
  countdownEnabled: integer("countdown_enabled", { mode: "boolean" }).notNull().default(false),
  /** Null: the default text. */
  textNone: text("text_none"),
  textAttending: text("text_attending"),
  textDeclined: text("text_declined"),
});

// --- Privacy notice (sw-architecture.md 24; SEC-09) ---------------------------------------

/** The admin's own privacy notice as Markdown; without a row the default text is used. */
export const privacyNotice = sqliteTable("privacy_notice", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id),
  markdown: text("markdown").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * The copyright line of the footer (LIC-02; sw-architecture.md 19.6). No row means the default
 * `© <year> <event name>`; an empty text hides the line.
 */
export const footerNotice = sqliteTable("footer_notice", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id),
  copyright: text("copyright").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
