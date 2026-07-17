import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Le dossier enum entier : les pgEnum sont modularisés par domaine
  // (enums.ts n'est plus qu'une façade de ré-export).
  schema: ["./packages/shared/schema", "./packages/shared/enum"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  tablesFilter: ["!session"],
});
