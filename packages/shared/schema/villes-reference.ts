import {
  pgTable,
  text,
  char,
  integer,
  numeric,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pays } from "./pays";

/**
 * Référentiel MONDIAL de villes (lieu de naissance des employés).
 *
 * Distinct de `villes` (operations.ts) qui reste la géographie OPÉRATIONNELLE
 * (Congo) utilisée pour les clients, agences et zones. Cette table est seedée
 * depuis `seeds/cities5000.txt` (GeoNames, villes de plus de 5000 habitants,
 * ~68k lignes) et n'alimente que l'autocomplétion du lieu de naissance,
 * filtrée par pays. Elle ne participe à aucun flux métier ou financier.
 */
export const villesReference = pgTable(
  "villes_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Identifiant naturel GeoNames (idempotence du seed)
    geonameId: integer("geoname_id").notNull(),
    // Noms
    nom: text("nom").notNull(),
    nomAscii: text("nom_ascii"), // recherche insensible aux accents
    // Rattachement pays (filtre de l'autocomplétion)
    paysId: uuid("pays_id").references(() => pays.id, { onDelete: "cascade" }),
    countryCode: char("country_code", { length: 2 }), // ISO2 GeoNames (traçabilité seed)
    admin1Code: text("admin1_code"),
    // Métadonnées GeoNames
    population: integer("population"),
    featureCode: text("feature_code"), // PPLC, PPLA, PPL...
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    timezone: text("timezone"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    uqGeonameId: uniqueIndex("uq_villes_reference_geoname_id").on(t.geonameId),
    // Autocomplétion : filtre pays + préfixe ascii, tri population
    idxPaysNomAscii: index("idx_villes_reference_pays_nom_ascii").on(
      t.paysId,
      t.nomAscii,
    ),
    idxPaysPopulation: index("idx_villes_reference_pays_population").on(
      t.paysId,
      t.population,
    ),
    idxCountryCode: index("idx_villes_reference_country").on(t.countryCode),
  }),
);

export const insertVilleReferenceSchema = createInsertSchema(villesReference).omit({
  id: true,
  createdAt: true,
});
export type InsertVilleReference = z.infer<typeof insertVilleReferenceSchema>;
export type VilleReference = typeof villesReference.$inferSelect;
