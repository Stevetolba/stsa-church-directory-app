import { defineConfig } from "drizzle-kit";

// Run under Node 24 (the repo's default `node` is v10 and breaks tooling):
//   nvm use 24 && npm run db:generate   # regenerate SQL after schema edits
//   nvm use 24 && npm run db:migrate     # apply migrations to DATABASE_URL
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
