import { pgTable, text, char, integer, numeric, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Table Pays — Référentiel ISO-3166 des pays
 *
 * Source de vérité pour les nationalités, pays d'émission des pièces d'identité,
 * pays de résidence, et conformité AML.
 *
 * Seedé depuis seeds/all.json (ISO-3166-1 complet).
 * Les flags AML (is_high_risk_aml, is_sanctioned) sont gérés manuellement via back-office.
 */
export const pays = pgTable("pays", {
  id: uuid("id").primaryKey().defaultRandom(),

  // ISO-3166-1
  iso2: char("iso2", { length: 2 }).notNull().unique(),
  iso3: char("iso3", { length: 3 }).notNull().unique(),
  numericCode: char("numeric_code", { length: 3 }),
  nomEn: text("nom_en").notNull(),
  nomFr: text("nom_fr"),

  // Métadonnées télécom / finance
  indicatifTel: text("indicatif_tel"),
  deviseCode: text("devise_code"),

  // Régions ISO-3166
  region: text("region"),
  subRegion: text("sub_region"),

  // Activation
  isActive: boolean("is_active").notNull().default(true),

  // AML / Conformité (gérés via back-office)
  isHighRiskAml: boolean("is_high_risk_aml").notNull().default(false),
  isSanctioned: boolean("is_sanctioned").notNull().default(false),

  // Géolocalisation (enrichi via allCountries.txt featureCode=PCLI)
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  population: integer("population"),
  geonameId: integer("geoname_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  idxNomFr: index("idx_pays_nom_fr").on(t.nomFr),
  idxIsActive: index("idx_pays_is_active").on(t.isActive),
  idxRegion: index("idx_pays_region").on(t.region),
  idxHighRisk: index("idx_pays_high_risk_aml").on(t.isHighRiskAml),
  uqGeonameId: uniqueIndex("uq_pays_geoname_id").on(t.geonameId),
}));

export const insertPaysSchema = createInsertSchema(pays).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPays = z.infer<typeof insertPaysSchema>;
export type Pays = typeof pays.$inferSelect;
