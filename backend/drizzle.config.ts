import { defineConfig } from "drizzle-kit";

// `npm run db:generate -w backend` writes a new SQL migration to ./drizzle after
// a change of src/database/schema.ts. Migrations are reviewed and committed (DATA-04).
// Only the newest snapshot in ./drizzle/meta is kept: delete the previous one after generating.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
});
