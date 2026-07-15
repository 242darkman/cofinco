import { z } from "zod";
import { currencyCode } from "@shared/config/currency";
import { TYPE_CONDITIONNEMENT_VALUES } from "@shared/enum/status-constants";

export const createEvacuationSchema = z.object({
  coffreSourceId: z.string().uuid(),
  agenceId: z.string().uuid(),
  typeDestination: z.enum(["BANQUE", "COFFRE_CENTRAL", "TRANSPORTEUR"]),
  banqueNom: z.string().optional(),
  banqueCompte: z.string().optional(),
  banqueNumeroComptable: z.string().optional(),
  coffreDestinationId: z.string().uuid().optional(),
  transporteurNom: z.string().optional(),
  transporteurContact: z.string().optional(),
  transporteurReference: z.string().optional(),
  montant: z.number().positive(),
  devise: z.string().default(currencyCode()),
  motifEvacuation: z.enum(["EXCEDENT_ENCAISSE", "FIN_EXERCICE", "SECURITE", "FERMETURE_AGENCE", "APPROVISIONNEMENT_SIEGE", "TRANSFERT_BANCAIRE", "AUTRE"]),
  motifDetail: z.string().min(10),
  idempotencyKey: z.string().optional(),
});

export const rejectEvacuationSchema = z.object({ reason: z.string().min(10) });

export const prepareEvacuationSchema = z.object({
  typeConditionnement: z.enum(TYPE_CONDITIONNEMENT_VALUES).optional(),
  numeroScelle: z.string().optional(),
  billetage: z.record(z.number()).optional(),
  montantCompte: z.number().positive().optional(),
  commentairePreparation: z.string().optional(),
});

export const dispatchEvacuationSchema = z.object({
  agentsTransport: z.array(z.object({
    userId: z.string().uuid().optional(),
    nom: z.string().min(2),
    contact: z.string().min(5),
    fonction: z.string().optional(),
  })).optional(),
  heureDepart: z.string().optional(),
});

export const depositEvacuationSchema = z.object({
  montantDepose: z.number().positive(),
  referenceBordereau: z.string().optional(),
  referenceRecuTransporteur: z.string().optional(),
  heureDepot: z.string().optional(),
  commentaireDepot: z.string().optional(),
});

export const reconcileEvacuationSchema = z.object({
  montantConfirme: z.number().min(0),
  conforme: z.boolean(),
  motifEcart: z.string().optional(),
});

export const cancelEvacuationSchema = z.object({ reason: z.string().min(10) });
