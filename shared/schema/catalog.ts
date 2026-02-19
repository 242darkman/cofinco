import { pgTable, text, boolean, timestamp, uuid, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================
// SECTEURS D'ACTIVITÉ (hiérarchique via parentId)
// =============================================

export const sectors = pgTable("sectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  nom: text("nom").notNull(),
  description: text("description"),
  parentId: uuid("parent_id"),
  keywords: text("keywords").array(),
  actif: boolean("actif").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_sectors_code").on(t.code),
  idxParent: index("idx_sectors_parent").on(t.parentId),
  idxActif: index("idx_sectors_actif").on(t.actif),
  idxNom: index("idx_sectors_nom").on(t.nom),
}));

export const insertSectorSchema = createInsertSchema(sectors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSector = z.infer<typeof insertSectorSchema>;
export type Sector = typeof sectors.$inferSelect;

// =============================================
// PROFESSIONS
// =============================================

export const professions = pgTable("professions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  nom: text("nom").notNull(),
  keywords: text("keywords").array(),
  actif: boolean("actif").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_professions_code").on(t.code),
  idxActif: index("idx_professions_actif").on(t.actif),
  idxNom: index("idx_professions_nom").on(t.nom),
}));

export const insertProfessionSchema = createInsertSchema(professions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfession = z.infer<typeof insertProfessionSchema>;
export type Profession = typeof professions.$inferSelect;

// =============================================
// TYPES D'ACTIVITÉ (statut socio-professionnel)
// =============================================

export const activityTypes = pgTable("activity_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  nom: text("nom").notNull(),
  actif: boolean("actif").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqCode: uniqueIndex("uq_activity_types_code").on(t.code),
  idxActif: index("idx_activity_types_actif").on(t.actif),
}));

export const insertActivityTypeSchema = createInsertSchema(activityTypes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertActivityType = z.infer<typeof insertActivityTypeSchema>;
export type ActivityType = typeof activityTypes.$inferSelect;

// =============================================
// TABLES DE MAPPING (junction)
// =============================================

// Profession ↔ Secteur
export const professionSectors = pgTable("profession_sectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  professionId: uuid("profession_id").notNull().references(() => professions.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").notNull().references(() => sectors.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(50),
  isDefault: boolean("is_default").notNull().default(false),
}, (t) => ({
  uqProfSector: uniqueIndex("uq_profession_sectors").on(t.professionId, t.sectorId),
  idxProfession: index("idx_prof_sectors_prof").on(t.professionId),
  idxSector: index("idx_prof_sectors_sector").on(t.sectorId),
}));

export const insertProfessionSectorSchema = createInsertSchema(professionSectors).omit({ id: true });
export type InsertProfessionSector = z.infer<typeof insertProfessionSectorSchema>;
export type ProfessionSector = typeof professionSectors.$inferSelect;

// Profession ↔ Type d'activité
export const professionActivityTypes = pgTable("profession_activity_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  professionId: uuid("profession_id").notNull().references(() => professions.id, { onDelete: "cascade" }),
  activityTypeId: uuid("activity_type_id").notNull().references(() => activityTypes.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(50),
  isDefault: boolean("is_default").notNull().default(false),
}, (t) => ({
  uqProfActivity: uniqueIndex("uq_profession_activity_types").on(t.professionId, t.activityTypeId),
  idxProfession: index("idx_prof_activity_prof").on(t.professionId),
  idxActivity: index("idx_prof_activity_type").on(t.activityTypeId),
}));

export const insertProfessionActivityTypeSchema = createInsertSchema(professionActivityTypes).omit({ id: true });
export type InsertProfessionActivityType = z.infer<typeof insertProfessionActivityTypeSchema>;
export type ProfessionActivityType = typeof professionActivityTypes.$inferSelect;

// Secteur ↔ Type d'activité
export const sectorActivityTypes = pgTable("sector_activity_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectorId: uuid("sector_id").notNull().references(() => sectors.id, { onDelete: "cascade" }),
  activityTypeId: uuid("activity_type_id").notNull().references(() => activityTypes.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(50),
}, (t) => ({
  uqSectorActivity: uniqueIndex("uq_sector_activity_types").on(t.sectorId, t.activityTypeId),
  idxSector: index("idx_sector_activity_sector").on(t.sectorId),
  idxActivity: index("idx_sector_activity_type").on(t.activityTypeId),
}));

export const insertSectorActivityTypeSchema = createInsertSchema(sectorActivityTypes).omit({ id: true });
export type InsertSectorActivityType = z.infer<typeof insertSectorActivityTypeSchema>;
export type SectorActivityType = typeof sectorActivityTypes.$inferSelect;
