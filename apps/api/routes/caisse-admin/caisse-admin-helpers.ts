import { z } from "zod";

export const forceCloseSessionSchema = z.object({
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères"),
  keepFunds: z.boolean().optional().default(false),
});

export const executeLiquidationSchema = z.object({
  destinationType: z.enum(['COFFRE', 'CAISSE']),
  destinationId: z.string().uuid(),
  motif: z.string().optional(),
});

export const historiqueQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  typeOperation: z.string().optional(),
  methodePaiement: z.string().optional(),
});

export const ecartApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

export const billetageSuggestionSchema = z.object({
  caisseId: z.string().uuid(),
  targetAmount: z.number().positive(),
  prioritizeSmallDenominations: z.boolean().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  isEndOfMonth: z.boolean().optional(),
});

export const saveTemplateSchema = z.object({
  nom: z.string().min(1).max(100),
  description: z.string().optional(),
  billetage: z.record(z.string(), z.number().int().min(0)),
  agenceId: z.string().uuid().optional(),
  caisseId: z.string().uuid().optional(),
});

export const initiateHandoverSchema = z.object({
  sessionId: z.string().uuid(),
  toCaissierId: z.string().uuid(),
  montantCompte: z.number().positive(),
  billetage: z.record(z.string(), z.number().int().min(0)).optional(),
  motif: z.string().optional(),
  observations: z.string().optional(),
});

export const confirmHandoverSchema = z.object({
  montantVerifie: z.number().nonnegative(),
  billetage: z.record(z.string(), z.number().int().min(0)).optional(),
  observations: z.string().optional(),
  ecartJustification: z.string().optional(),
});

export const cancelHandoverSchema = z.object({
  reason: z.string().min(5, "La raison doit contenir au moins 5 caractères"),
});

export const approveHandoverSchema = z.object({
  comment: z.string().optional(),
});

export const generateCodeSchema = z.object({
  agenceId: z.string().uuid().optional(),
  caisseId: z.string().uuid().optional(),
  codeType: z.enum(['EMERGENCY', 'DAILY', 'PERMANENT']),
  description: z.string().optional(),
  maxUsages: z.number().int().min(1).optional(),
  expiresInHours: z.number().int().min(1).optional(),
  authorizationDurationHours: z.number().int().min(1).max(24).optional(),
  assignedToUserId: z.string().uuid().optional(),
  sendNotification: z.boolean().optional(),
});

export const validateCodeSchema = z.object({
  code: z.string().min(4).max(12),
  agenceId: z.string().uuid().optional(),
  caisseId: z.string().uuid().optional(),
  action: z.string().optional(),
});

export const rotationPolicySchema = z.object({
  agenceId: z.string().uuid().optional(),
  rotationFrequencyDays: z.number().int().min(1).max(365).optional(),
  maxUsageBeforeRotation: z.number().int().min(1).optional(),
  notifyDaysBeforeExpiry: z.number().int().min(1).max(30).optional(),
  autoGenerateOnExpiry: z.boolean().optional(),
});

export const processRequestSchema = z.object({
  sessionCaisseId: z.string().uuid(),
});

export const cancelRequestSchema = z.object({
  reason: z.string().min(3, "Le motif doit contenir au moins 3 caractères"),
});

export const balanceCorrectionSchema = z.object({
  newBalance: z.number().min(0, "Le nouveau solde doit être >= 0"),
  motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères"),
});