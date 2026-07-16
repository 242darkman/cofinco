/**
 * Schéma Drizzle — Cartes de pointage (épargne libre par cases).
 *
 * Une carte appartient à un client, porte un montant unitaire fixe `M`
 * défini à l'ouverture et exactement 31 cases. Les versements cochent les
 * cases une à une, sans contrainte de régularité ni date d'expiration.
 * Au retrait, le client reçoit `M×N − M` et la retenue `M` alimente la
 * caisse de l'agent validateur, puis la carte est clôturée (WITHDRAWN).
 *
 * Voir `packages/shared/utils/carte-pointage.ts` pour les règles de calcul.
 */

import { pgTable, text, integer, numeric, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import { users } from "./auth";
import { clients } from "./clients";
import { agences } from "./agences";
import { mouvementsFinanciers } from "./finance";
import { DEFAULT_CURRENCY } from "../config/currency";
import {
  statutCartePointageEnum,
  typeTransactionPointageEnum,
  methodePaiementEnum,
} from "../enum/enums";
import { NOMBRE_CASES_CARTE_POINTAGE } from "../utils/carte-pointage";

// ============================================================================
// TABLE: cartes_pointage
// Une carte d'épargne à 31 cases par client (plusieurs cartes en parallèle).
// ============================================================================

export const cartesPointage = pgTable(
  "cartes_pointage",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Référence lisible et unique, encodée dans le QR code (ex: CDP-2026-A1B2C3). */
    reference: text("reference").notNull(),

    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),

    /** Agence de rattachement — porte l'isolation de périmètre et le GL. */
    agenceId: uuid("agence_id")
      .notNull()
      .references(() => agences.id, { onDelete: "restrict" }),

    /** Montant fixe par case (M), figé à l'ouverture. Jamais modifiable. */
    unitAmount: numeric("unit_amount", { precision: 15, scale: 2 }).notNull(),

    devise: text("devise").notNull().default(DEFAULT_CURRENCY.code),

    /** Nombre de cases cochées (0..31). Source de vérité du N de la formule. */
    completedSlots: integer("completed_slots").notNull().default(0),

    status: statutCartePointageEnum("status").notNull().default("ACTIVE"),

    /** Date de clôture (retrait). Nulle tant que la carte est active. */
    withdrawnAt: timestamp("withdrawn_at"),

    // Traçabilité
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete (jamais de suppression physique)

    /** Verrouillage optimiste : incrémenté à chaque mutation financière. */
    version: integer("version").notNull().default(1),
  },
  (t) => ({
    uqReference: uniqueIndex("uq_cartes_pointage_reference").on(t.reference),
    idxClientStatut: index("idx_cartes_pointage_client_statut").on(t.clientId, t.status),
    idxAgenceStatut: index("idx_cartes_pointage_agence_statut").on(t.agenceId, t.status),
    idxDeletedAt: index("idx_cartes_pointage_deleted_at").on(t.deletedAt),
    // Invariants défendus en base, pas seulement dans le code applicatif.
    ckSlots: check(
      "ck_cartes_pointage_slots",
      sql`${t.completedSlots} >= 0 AND ${t.completedSlots} <= ${sql.raw(String(NOMBRE_CASES_CARTE_POINTAGE))}`,
    ),
    ckUnitAmount: check("ck_cartes_pointage_unit_amount", sql`${t.unitAmount} > 0`),
  }),
);

// ============================================================================
// TABLE: transactions_pointage
// Journal immuable des versements et du retrait d'une carte.
// ============================================================================

export const transactionsPointage = pgTable(
  "transactions_pointage",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    cardId: uuid("card_id")
      .notNull()
      .references(() => cartesPointage.id, { onDelete: "restrict" }),

    type: typeTransactionPointageEnum("type").notNull(),

    /** Dépôt : montant unitaire M. Retrait : montant restitué au client (M×N − M). */
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),

    /** Retrait uniquement : retenue M transférée en commission caisse. Sinon 0. */
    commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),

    /** Dépôt uniquement : numéro de la case cochée (1..31). */
    slotNumber: integer("slot_number"),

    paymentMethod: methodePaiementEnum("payment_method").notNull(),

    /** Session de caisse de l'agent ayant validé l'opération (espèces). */
    sessionCaisseId: uuid("session_caisse_id"),

    /** Lien d'audit vers le mouvement financier du ledger (invariant §9). */
    mouvementFinancierId: uuid("mouvement_financier_id").references(
      () => mouvementsFinanciers.id,
      { onDelete: "restrict" },
    ),

    /** Protection contre les doubles soumissions (retries réseau). */
    idempotencyKey: text("idempotency_key").notNull(),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uqIdempotency: uniqueIndex("uq_transactions_pointage_idem").on(t.idempotencyKey),
    // Une case ne peut être cochée qu'une seule fois par carte.
    uqCardSlot: uniqueIndex("uq_transactions_pointage_card_slot").on(t.cardId, t.slotNumber),
    idxCardDate: index("idx_transactions_pointage_card_date").on(t.cardId, t.createdAt),
    ckSlotNumber: check(
      "ck_transactions_pointage_slot",
      sql`${t.slotNumber} IS NULL OR (${t.slotNumber} >= 1 AND ${t.slotNumber} <= ${sql.raw(String(NOMBRE_CASES_CARTE_POINTAGE))})`,
    ),
    ckAmount: check("ck_transactions_pointage_amount", sql`${t.amount} >= 0`),
  }),
);

// ============================================================================
// Schémas zod & types (contrats partagés web/api)
// ============================================================================

/** Schéma d'insertion d'une carte — la référence et l'agence sont fixées côté serveur. */
export const insertCartePointageSchema = createInsertSchema(cartesPointage, {
  unitAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Montant unitaire invalide")
    .refine((v) => Number(v) > 0, "Le montant unitaire doit être strictement positif"),
}).omit({
  id: true,
  reference: true,
  completedSlots: true,
  status: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
});

/** Corps de requête d'ouverture de carte (frontière API). */
export const ouvrirCartePointageSchema = z.object({
  clientId: z.string().uuid(),
  unitAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Montant unitaire invalide")
    .refine((v) => Number(v) > 0, "Le montant unitaire doit être strictement positif"),
});

/** Corps de requête d'un versement (pointage d'une case). */
export const versementCartePointageSchema = z.object({
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY"]),
  idempotencyKey: z.string().min(8).max(128),
});

/** Corps de requête d'un retrait (clôture de la carte). */
export const retraitCartePointageSchema = z.object({
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY"]),
  idempotencyKey: z.string().min(8).max(128),
});

export type CartePointage = typeof cartesPointage.$inferSelect;
export type InsertCartePointage = z.infer<typeof insertCartePointageSchema>;
export type TransactionPointage = typeof transactionsPointage.$inferSelect;
export type InsertTransactionPointage = typeof transactionsPointage.$inferInsert;
export type OuvrirCartePointageInput = z.infer<typeof ouvrirCartePointageSchema>;
export type VersementCartePointageInput = z.infer<typeof versementCartePointageSchema>;
export type RetraitCartePointageInput = z.infer<typeof retraitCartePointageSchema>;
