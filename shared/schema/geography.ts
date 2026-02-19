import { pgTable, text, char, integer, numeric, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pays } from "./pays";

/**
 * Table Regions — ADM1 administrative divisions (mondial)
 *
 * Source: GeoNames admin1CodesASCII.txt
 * Exemples: Pool (CG.11), Île-de-France (FR.11), California (US.CA)
 *
 * Chaque région appartient à un pays et possède un code GeoNames unique
 * de la forme "CC.ADMIN1" (ex: CG.11 pour Pool au Congo).
 */
export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Hiérarchie
  paysId: uuid("pays_id").notNull()
    .references(() => pays.id, { onDelete: "restrict" }),

  // GeoNames identifiers
  code: text("code").notNull(),              // ex: "CG.11"
  geonameId: integer("geoname_id"),

  // Noms
  nom: text("nom").notNull(),
  nomAscii: text("nom_ascii"),

  // Géolocalisation (enrichi via allCountries.txt)
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  population: integer("population"),

  // Activation
  actif: boolean("actif").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_regions_code").on(t.code),
  uqGeonameId: uniqueIndex("uq_regions_geoname_id").on(t.geonameId),
  idxPays: index("idx_regions_pays").on(t.paysId),
  idxPaysNom: index("idx_regions_pays_nom").on(t.paysId, t.nom),
  idxActif: index("idx_regions_actif").on(t.actif),
}));

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regions.$inferSelect;

/**
 * Table Staging GeoNames — Table temporaire pour COPY + enrichissement
 *
 * Utilisée pour importer allCountries.txt via COPY, puis enrichir
 * les tables regions, departements, pays et villes via SQL JOINs.
 *
 * Contient uniquement les lignes featureClass IN ('A', 'P') ou featureCode = 'PCLI'.
 */
export const geonamesStaging = pgTable("geonames_staging", {
  geonameId: integer("geoname_id").primaryKey(),
  name: text("name").notNull(),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  featureClass: char("feature_class", { length: 1 }),
  featureCode: text("feature_code"),
  countryCode: char("country_code", { length: 2 }),
  admin1Code: text("admin1_code"),
  admin2Code: text("admin2_code"),
  population: integer("population").default(0),
  timezone: text("timezone"),
}, (t) => ({
  idxCountryCode: index("idx_geonames_staging_cc").on(t.countryCode),
  idxFeatureClass: index("idx_geonames_staging_fc").on(t.featureClass),
  idxFeatureCode: index("idx_geonames_staging_fcode").on(t.featureCode),
  idxAdmin1: index("idx_geonames_staging_admin1").on(t.countryCode, t.admin1Code),
  idxAdmin2: index("idx_geonames_staging_admin2").on(t.countryCode, t.admin1Code, t.admin2Code),
  idxPopulation: index("idx_geonames_staging_pop").on(t.population),
}));
