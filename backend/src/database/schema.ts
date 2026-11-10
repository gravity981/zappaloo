// Drizzle schema of the application database. Tables are added with the
// features that need them; every change is followed by
// `npm run db:generate -w backend`, which writes a new migration (DATA-04).
//
// Every event-related table carries an `event_id` that references `events`
// (DATA-02); a test checks this for every table, so a table added later cannot
// forget it.
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
