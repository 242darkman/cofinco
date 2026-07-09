/**
 * Déclarations partagées des routes comptes (logger, helpers).
 */
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { or } from "drizzle-orm";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage, SuspensionReason } from "@shared/enum/status-constants";

export const logger = createLogger('Routes:Comptes');

export function getRequiredKycTypes(typePiece: string | null | undefined): string[] {
  switch (typePiece) {
    case 'PASSPORT':         return ['PASSPORT'];
    case 'PERMIS_CONDUIRE':  return ['DRIVING_LICENSE'];
    case 'CARTE_RESIDENT':   return ['RESIDENT_CARD'];
    default:                 return ['ID_CARD_FRONT', 'ID_CARD_BACK']; // CNI or unset
  }
}

export const createCompteSchema = z.object({
  clientId: z.string().uuid(),
  typeCompte: z.enum([TypeCompte.SAVINGS, TypeCompte.CURRENT, TypeCompte.BLOCKED]),
  agenceId: z.string().uuid(),
  produitId: z.string().uuid().optional(),
  soldeInitial: z.number().min(0).optional().default(0),
  modePaiement: z.enum([MethodePaiement.CASH, MethodePaiement.TRANSFER, MethodePaiement.MOBILE_MONEY]).default(MethodePaiement.CASH),
  compteSourceId: z.string().uuid().optional(), // requis si Virement
  operateurMobile: z.enum(["MTN", "AIRTEL"]).optional(),
  telephoneMobileMoney: z.string().optional(),
  referenceTransaction: z.string().optional(),
  blocageActif: z.boolean().optional(),
  blocageMotif: z.enum([
    MotifBlocage.LOAN_GUARANTEE,
    MotifBlocage.TONTINE_GUARANTEE,
    MotifBlocage.FORCED_SAVINGS,
    MotifBlocage.INTERNAL_DECISION,
    MotifBlocage.DISPUTE,
    MotifBlocage.OTHER,
  ]).optional(),
  blocageReference: z.string().optional(),
  blocageFin: z.string().optional(), // ISO date string for blocked account end date
});

export const depotRetraitSchema = z.object({
  montant: z.number().positive("Le montant doit être positif"),
  methodePaiement: z.string().default(MethodePaiement.CASH),
  sessionCaisseId: z.string().uuid().optional(),
  observations: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const blocageSchema = z.object({
  motif: z.enum([
    MotifBlocage.LOAN_GUARANTEE,
    MotifBlocage.TONTINE_GUARANTEE,
    MotifBlocage.FORCED_SAVINGS,
    MotifBlocage.INTERNAL_DECISION,
    MotifBlocage.DISPUTE,
    MotifBlocage.OTHER,
  ]),
  reference: z.string().optional(),
  dateFin: z.string().datetime().optional(),
});

export const deblocageSchema = z.object({
  motif: z.string().optional(),
});

export const transfertAgenceSchema = z.object({
  nouvelleAgenceId: z.string().uuid(),
  motif: z.string().optional(),
});

export const virementCompteSchema = z.object({
  sourceCompteId: z.string().uuid(),
  destinationCompteId: z.string().uuid().optional(),
  destinationAccountNumber: z.string().min(3).optional(),
  montant: z.coerce.number().positive("Le montant doit etre positif"),
  scheduled: z.boolean().optional().default(false),
  frequence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY"]).optional().default("ONCE"),
  prochaineExecution: z.string().datetime({ offset: true }).optional(), // ISO datetime for Cron start
});

export const suspendSchema = z.object({
  reasonCode: z.enum([
    SuspensionReason.KYC,
    SuspensionReason.FRAUD,
    SuspensionReason.INTERNAL,
    SuspensionReason.CLIENT_REQUEST,
    SuspensionReason.DISPUTE,
    SuspensionReason.OTHER,
  ]),
  reasonText: z.string().optional(),
  autoLift: z.boolean().optional().default(false),
  endDate: z.string().datetime().optional(),
  reviewRequired: z.boolean().optional().default(false),
});

export const unsuspendSchema = z.object({
  motif: z.string().optional(),
});

export const initiateClosureSchema = z.object({
  reason: z.string().min(3, "Motif requis (min 3 caractères)"),
  payoutMethod: z.enum(["CASH", "MOBILE_MONEY"]),
  payoutPhoneNumber: z.string().optional(),
});

export const cancelClosureSchema = z.object({
  cancelReason: z.string().min(3, "Motif d'annulation requis (min 3 caractères)"),
});

export const updateVirementProgrammeSchema = z.object({
  montant: z.coerce.number().positive().optional(),
  frequence: z.enum(["once", "daily", "weekly", "monthly"]).optional(),
  prochaineExecution: z.string().nullable().optional(),
  actif: z.boolean().optional(),
});
