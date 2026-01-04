import { db } from './db';
import { 
  transferts, transfertAuditLogs, transfertLimits, transfertBlacklist, 
  transfertWebhooks, kycLevels, users 
} from '@shared/schema';
import { eq, and, gte, sql, desc, count } from 'drizzle-orm';
import crypto from 'crypto';
import type { Request } from 'express';

// ============ CONFIGURATION SÉCURITÉ (BEAC/CEMAC Conformité) ============

// Limites RÉGLEMENTAIRES strictes CEMAC/BEAC
export const REGULATORY_LIMITS = {
  ABSOLUTE_MAX_SINGLE: 5000000,    // 5M XAF max absolu par transaction (réglementation)
  ABSOLUTE_MAX_DAILY: 10000000,    // 10M XAF max absolu par jour (réglementation)
  REQUIRES_ENHANCED_KYC: 500000,   // Au-dessus de 500K: vérification renforcée
  REQUIRES_DOCUMENT: 150000        // Au-dessus de 150K: document obligatoire
};

// Limites CEMAC/BEAC conformes par niveau KYC
export const LIMITS_CEMAC = {
  KYC_LEVEL_1: {
    dailyLimit: 500000,      // 500,000 XAF/jour
    monthlyLimit: 2000000,   // 2M XAF/mois
    singleLimit: 150000,     // 150,000 XAF max par transaction
    maxTransfersPerDay: 5
  },
  KYC_LEVEL_2: {
    dailyLimit: 2000000,     // 2M XAF/jour
    monthlyLimit: 10000000,  // 10M XAF/mois
    singleLimit: 1000000,    // 1M XAF max par transaction
    maxTransfersPerDay: 10
  },
  KYC_LEVEL_3: {
    dailyLimit: 5000000,     // 5M XAF/jour
    monthlyLimit: 50000000,  // 50M XAF/mois
    singleLimit: 5000000,    // 5M XAF max par transaction (plafond réglementaire)
    maxTransfersPerDay: 20
  }
};

// Seuils d'alerte AML
export const AML_THRESHOLDS = {
  SUSPICIOUS_AMOUNT: 1000000,        // 1M XAF déclenche vérification
  HIGH_RISK_AMOUNT: 3000000,         // 3M XAF nécessite approbation
  VELOCITY_THRESHOLD: 3,             // 3+ transferts en 1h = alerte
  ROUND_AMOUNT_THRESHOLD: 100000,    // Montants ronds suspects
  STRUCTURING_THRESHOLD: 4           // 4+ transferts juste sous limite
};

// ============ GÉNÉRATION DE RÉFÉRENCES SÉCURISÉES ============

export function generateTransferReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TRF${timestamp}${random}`;
}

export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function hashOTP(otp: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(otp).digest('hex');
}

export function generateSecretCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function generateIdempotencyKey(data: object): string {
  const json = JSON.stringify(data);
  return crypto.createHash('sha256').update(json).digest('hex');
}

// ============ VALIDATION DE SÉCURITÉ ============

export interface TransferValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskScore: number;
  riskFlags: string[];
  requiresOtp: boolean;
  requiresApproval: boolean;
  limits: {
    remainingDaily: number;
    remainingMonthly: number;
    currentKycLevel: number;
  };
}

export interface TransferRequest {
  expediteurNom: string;
  expediteurTelephone: string;
  expediteurEmail?: string;
  expediteurTypeDocument?: string;
  expediteurNumeroDocument?: string;
  beneficiaireNom: string;
  beneficiaireTelephone: string;
  beneficiaireEmail?: string;
  beneficiairePays: string;
  beneficiaireVille?: string;
  beneficiaireAdresse?: string;
  montantEnvoye: number;
  deviseEnvoi: string;
  deviseReception: string;
  operateurId: string;
  modeReception: string;
  modePaiement: string;
  motifTransfert?: string;
}

// Validation du numéro de téléphone
export function validatePhoneNumber(phone: string): boolean {
  // Format Congo: +242 ou 06/05/04
  const patterns = [
    /^\+242\d{9}$/,           // +242XXXXXXXXX
    /^242\d{9}$/,             // 242XXXXXXXXX
    /^0[456]\d{7}$/,          // 06XXXXXXX, 05XXXXXXX, 04XXXXXXX
    /^\+\d{10,15}$/           // Format international général
  ];
  return patterns.some(p => p.test(phone.replace(/\s/g, '')));
}

// Validation du montant
export function validateAmount(amount: number): { valid: boolean; message?: string } {
  if (amount <= 0) {
    return { valid: false, message: 'Le montant doit être positif' };
  }
  if (amount < 500) {
    return { valid: false, message: 'Montant minimum: 500 XAF' };
  }
  if (amount > 10000000) {
    return { valid: false, message: 'Montant maximum: 10,000,000 XAF' };
  }
  return { valid: true };
}

// ============ VÉRIFICATION LISTE NOIRE (COMPLÈTE) ============

export interface BlacklistCheckParams {
  senderPhone: string;
  senderEmail?: string;
  senderDocument?: string;
  beneficiaryPhone: string;
  beneficiaryEmail?: string;
  ip?: string;
  deviceFingerprint?: string;
}

export async function checkBlacklist(params: BlacklistCheckParams): Promise<{ blocked: boolean; reasons: string[]; severity: string }> {
  const reasons: string[] = [];
  let maxSeverity = 'low';
  
  const checkEntity = async (type: string, value: string | undefined, label: string) => {
    if (!value) return;
    
    try {
      const blocked = await db.select()
        .from(transfertBlacklist)
        .where(and(
          eq(transfertBlacklist.type, type),
          eq(transfertBlacklist.valeur, value),
          eq(transfertBlacklist.actif, true)
        ))
        .limit(1);
      
      if (blocked.length > 0) {
        reasons.push(`${label}: ${blocked[0].raison}`);
        if (blocked[0].severite === 'critical') maxSeverity = 'critical';
        else if (blocked[0].severite === 'high' && maxSeverity !== 'critical') maxSeverity = 'high';
        else if (blocked[0].severite === 'medium' && maxSeverity === 'low') maxSeverity = 'medium';
      }
    } catch (error) {
      console.error(`Erreur vérification ${type}:`, error);
    }
  };

  // Vérification expéditeur
  await checkEntity('phone', params.senderPhone, 'Téléphone expéditeur bloqué');
  await checkEntity('email', params.senderEmail, 'Email expéditeur bloqué');
  await checkEntity('document', params.senderDocument, 'Document expéditeur bloqué');

  // Vérification bénéficiaire (CRITIQUE)
  await checkEntity('phone', params.beneficiaryPhone, 'Téléphone bénéficiaire bloqué');
  await checkEntity('email', params.beneficiaryEmail, 'Email bénéficiaire bloqué');

  // Vérification technique
  await checkEntity('ip', params.ip, 'Adresse IP bloquée');
  await checkEntity('device', params.deviceFingerprint, 'Appareil bloqué');

  return { 
    blocked: reasons.length > 0, 
    reasons,
    severity: maxSeverity
  };
}

// Version simplifiée pour compatibilité
export async function checkBlacklistSimple(
  phone: string, 
  email?: string, 
  documentNumber?: string,
  ip?: string
): Promise<{ blocked: boolean; reasons: string[] }> {
  const result = await checkBlacklist({
    senderPhone: phone,
    senderEmail: email,
    senderDocument: documentNumber,
    beneficiaryPhone: '',
    ip
  });
  return { blocked: result.blocked, reasons: result.reasons };
}

// ============ VÉRIFICATION DES LIMITES ============

export async function checkTransferLimits(
  phone: string,
  amount: number,
  kycLevel: number = 1
): Promise<{ allowed: boolean; message?: string; remaining: { daily: number; monthly: number } }> {
  const limits = kycLevel === 3 ? LIMITS_CEMAC.KYC_LEVEL_3 :
                 kycLevel === 2 ? LIMITS_CEMAC.KYC_LEVEL_2 :
                 LIMITS_CEMAC.KYC_LEVEL_1;

  try {
    // Récupérer ou créer les limites du client
    let clientLimits = await db.select()
      .from(transfertLimits)
      .where(eq(transfertLimits.telephone, phone))
      .limit(1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    if (clientLimits.length === 0) {
      // Créer les limites initiales
      await db.insert(transfertLimits).values({
        telephone: phone,
        kycLevel,
        totalJournalier: '0',
        totalMensuel: '0',
        nombreTransfertJour: 0,
        nombreTransfertMois: 0,
        dateResetJournalier: today,
        dateResetMensuel: monthStart
      });
      
      return {
        allowed: amount <= limits.singleLimit,
        remaining: {
          daily: limits.dailyLimit,
          monthly: limits.monthlyLimit
        }
      };
    }

    const limit = clientLimits[0];

    // Vérifier si blocage
    if (limit.bloque) {
      return {
        allowed: false,
        message: `Compte bloqué: ${limit.raisonBlocage || 'Contactez le support'}`,
        remaining: { daily: 0, monthly: 0 }
      };
    }

    // Réinitialiser les compteurs si nécessaire
    let dailyTotal = parseFloat(limit.totalJournalier || '0');
    let monthlyTotal = parseFloat(limit.totalMensuel || '0');
    let dailyCount = limit.nombreTransfertJour || 0;
    let monthlyCount = limit.nombreTransfertMois || 0;

    const resetDate = limit.dateResetJournalier ? new Date(limit.dateResetJournalier) : today;
    const monthResetDate = limit.dateResetMensuel ? new Date(limit.dateResetMensuel) : monthStart;

    if (resetDate < today) {
      dailyTotal = 0;
      dailyCount = 0;
    }

    if (monthResetDate < monthStart) {
      monthlyTotal = 0;
      monthlyCount = 0;
    }

    // Vérifications
    if (amount > limits.singleLimit) {
      return {
        allowed: false,
        message: `Montant max par transaction: ${limits.singleLimit.toLocaleString()} XAF (niveau KYC ${kycLevel})`,
        remaining: { daily: limits.dailyLimit - dailyTotal, monthly: limits.monthlyLimit - monthlyTotal }
      };
    }

    if (dailyTotal + amount > limits.dailyLimit) {
      return {
        allowed: false,
        message: `Limite journalière atteinte: ${limits.dailyLimit.toLocaleString()} XAF`,
        remaining: { daily: limits.dailyLimit - dailyTotal, monthly: limits.monthlyLimit - monthlyTotal }
      };
    }

    if (monthlyTotal + amount > limits.monthlyLimit) {
      return {
        allowed: false,
        message: `Limite mensuelle atteinte: ${limits.monthlyLimit.toLocaleString()} XAF`,
        remaining: { daily: limits.dailyLimit - dailyTotal, monthly: limits.monthlyLimit - monthlyTotal }
      };
    }

    if (dailyCount >= limits.maxTransfersPerDay) {
      return {
        allowed: false,
        message: `Nombre max de transferts/jour atteint: ${limits.maxTransfersPerDay}`,
        remaining: { daily: limits.dailyLimit - dailyTotal, monthly: limits.monthlyLimit - monthlyTotal }
      };
    }

    return {
      allowed: true,
      remaining: {
        daily: limits.dailyLimit - dailyTotal,
        monthly: limits.monthlyLimit - monthlyTotal
      }
    };
  } catch (error) {
    console.error('Erreur vérification limites:', error);
    return {
      allowed: false,
      message: 'Erreur de vérification des limites',
      remaining: { daily: 0, monthly: 0 }
    };
  }
}

// ============ ANALYSE DE RISQUE (FRAUD DETECTION) ============

export interface RiskAnalysis {
  score: number;        // 0-100, plus élevé = plus risqué
  level: 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
  requiresReview: boolean;
  requiresOtp: boolean;
}

export async function analyzeTransferRisk(
  request: TransferRequest,
  ip?: string,
  userAgent?: string
): Promise<RiskAnalysis> {
  const flags: string[] = [];
  let score = 0;

  // 1. Montant élevé
  if (request.montantEnvoye >= AML_THRESHOLDS.HIGH_RISK_AMOUNT) {
    flags.push('HIGH_AMOUNT');
    score += 30;
  } else if (request.montantEnvoye >= AML_THRESHOLDS.SUSPICIOUS_AMOUNT) {
    flags.push('SUSPICIOUS_AMOUNT');
    score += 15;
  }

  // 2. Montant rond (potentiel structuring)
  if (request.montantEnvoye % AML_THRESHOLDS.ROUND_AMOUNT_THRESHOLD === 0 && 
      request.montantEnvoye >= 500000) {
    flags.push('ROUND_AMOUNT');
    score += 10;
  }

  // 3. Premier transfert (nouveau client)
  try {
    const previousTransfers = await db.select()
      .from(transferts)
      .where(eq(transferts.expediteurTelephone, request.expediteurTelephone))
      .limit(1);
    
    if (previousTransfers.length === 0) {
      flags.push('NEW_CUSTOMER');
      score += 10;
    }
  } catch (error) {
    // Ignorer l'erreur, continuer l'analyse
  }

  // 4. Pays à risque (liste GAFI)
  const highRiskCountries = ['IR', 'KP', 'MM', 'SY', 'YE'];
  const mediumRiskCountries = ['AF', 'IQ', 'LY', 'PK', 'SD', 'SO', 'VE', 'ZW'];
  
  if (highRiskCountries.includes(request.beneficiairePays)) {
    flags.push('HIGH_RISK_COUNTRY');
    score += 40;
  } else if (mediumRiskCountries.includes(request.beneficiairePays)) {
    flags.push('MEDIUM_RISK_COUNTRY');
    score += 20;
  }

  // 5. Transfert international
  if (request.beneficiairePays !== 'CG') {
    flags.push('INTERNATIONAL');
    score += 5;
  }

  // 6. Pas de document d'identité
  if (!request.expediteurTypeDocument || !request.expediteurNumeroDocument) {
    flags.push('NO_ID_DOCUMENT');
    score += 15;
  }

  // 7. Heure inhabituelle (nuit)
  const hour = new Date().getHours();
  if (hour < 6 || hour > 22) {
    flags.push('UNUSUAL_HOUR');
    score += 10;
  }

  // Déterminer le niveau de risque
  let level: RiskAnalysis['level'];
  if (score >= 70) {
    level = 'critical';
  } else if (score >= 50) {
    level = 'high';
  } else if (score >= 25) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return {
    score,
    level,
    flags,
    requiresReview: score >= 50,
    requiresOtp: score >= 25 || request.montantEnvoye >= 500000
  };
}

// ============ AUDIT TRAIL ============

export async function logTransferAudit(
  transfertId: string,
  action: string,
  ancienStatut: string | null,
  nouveauStatut: string | null,
  details: object,
  req?: Request,
  userId?: string,
  previousHash?: string
): Promise<string> {
  try {
    // Créer le hash de cet enregistrement (chaîne de hash pour immutabilité)
    const hashData = JSON.stringify({
      transfertId,
      action,
      ancienStatut,
      nouveauStatut,
      details,
      timestamp: new Date().toISOString(),
      previousHash
    });
    const currentHash = crypto.createHash('sha256').update(hashData).digest('hex');

    await db.insert(transfertAuditLogs).values({
      transfertId,
      action,
      ancienStatut,
      nouveauStatut,
      details,
      ipAddress: req?.ip || req?.socket?.remoteAddress || null,
      userAgent: req?.get('User-Agent') || null,
      userId: userId || null,
      hashPrecedent: previousHash || null,
      hashActuel: currentHash
    });

    return currentHash;
  } catch (error) {
    console.error('Erreur audit log:', error);
    throw error;
  }
}

// ============ VALIDATION COMPLÈTE (CONFORME BEAC/CEMAC) ============

export async function validateTransfer(
  request: TransferRequest,
  ip?: string,
  userAgent?: string,
  deviceFingerprint?: string
): Promise<TransferValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const riskFlags: string[] = [];
  let riskScore = 0;

  // 0. LIMITES RÉGLEMENTAIRES ABSOLUES (BEAC/CEMAC - non contournables)
  if (request.montantEnvoye > REGULATORY_LIMITS.ABSOLUTE_MAX_SINGLE) {
    errors.push(`Montant maximum réglementaire: ${REGULATORY_LIMITS.ABSOLUTE_MAX_SINGLE.toLocaleString()} XAF par transaction`);
    riskFlags.push('REGULATORY_LIMIT_EXCEEDED');
  }

  // 1. Validation du téléphone expéditeur
  if (!validatePhoneNumber(request.expediteurTelephone)) {
    errors.push('Numéro de téléphone expéditeur invalide');
  }

  // 2. Validation du téléphone bénéficiaire
  if (!validatePhoneNumber(request.beneficiaireTelephone)) {
    errors.push('Numéro de téléphone bénéficiaire invalide');
  }

  // 3. Validation du montant basique
  const amountValidation = validateAmount(request.montantEnvoye);
  if (!amountValidation.valid) {
    errors.push(amountValidation.message!);
  }

  // 4. Document obligatoire au-dessus du seuil réglementaire
  if (request.montantEnvoye > REGULATORY_LIMITS.REQUIRES_DOCUMENT) {
    if (!request.expediteurTypeDocument || !request.expediteurNumeroDocument) {
      errors.push(`Document d'identité obligatoire pour les montants > ${REGULATORY_LIMITS.REQUIRES_DOCUMENT.toLocaleString()} XAF`);
      riskFlags.push('MISSING_ID_REQUIRED');
    }
  }

  // 5. Vérification liste noire COMPLÈTE (expéditeur + bénéficiaire)
  const blacklistCheck = await checkBlacklist({
    senderPhone: request.expediteurTelephone,
    senderEmail: request.expediteurEmail,
    senderDocument: request.expediteurNumeroDocument,
    beneficiaryPhone: request.beneficiaireTelephone,
    beneficiaryEmail: request.beneficiaireEmail,
    ip,
    deviceFingerprint
  });
  
  if (blacklistCheck.blocked) {
    errors.push(...blacklistCheck.reasons);
    riskFlags.push('BLACKLISTED');
    riskScore += blacklistCheck.severity === 'critical' ? 100 : 
                 blacklistCheck.severity === 'high' ? 70 : 40;
  }

  // 6. Vérification des limites (KYC + réglementaire)
  const limitsCheck = await checkTransferLimits(
    request.expediteurTelephone,
    request.montantEnvoye,
    1 // KYC Level par défaut
  );
  if (!limitsCheck.allowed) {
    errors.push(limitsCheck.message!);
  }

  // 7. Analyse de risque avec détection de fraude
  const riskAnalysis = await analyzeTransferRisk(request, ip, userAgent);
  riskScore = Math.min(riskScore + riskAnalysis.score, 100);
  riskFlags.push(...riskAnalysis.flags);

  // 8. BLOCAGE pour risque critique
  if (riskAnalysis.level === 'critical') {
    errors.push('Transaction bloquée: risque critique détecté. Contactez le support.');
    riskFlags.push('CRITICAL_RISK_BLOCKED');
  } else if (riskAnalysis.level === 'high') {
    warnings.push('Cette transaction nécessite une approbation manuelle');
  }

  // 9. Auto-transfert interdit
  if (request.expediteurTelephone === request.beneficiaireTelephone) {
    errors.push('Auto-transfert non autorisé');
    riskFlags.push('SELF_TRANSFER');
  }

  // 10. KYC renforcé au-dessus du seuil
  const requiresEnhancedKyc = request.montantEnvoye >= REGULATORY_LIMITS.REQUIRES_ENHANCED_KYC;
  if (requiresEnhancedKyc) {
    warnings.push('Vérification d\'identité renforcée requise');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskScore,
    riskFlags,
    requiresOtp: riskAnalysis.requiresOtp || request.montantEnvoye >= 500000 || requiresEnhancedKyc,
    requiresApproval: riskAnalysis.requiresReview || riskAnalysis.level === 'high',
    limits: {
      remainingDaily: limitsCheck.remaining.daily,
      remainingMonthly: limitsCheck.remaining.monthly,
      currentKycLevel: 1
    }
  };
}

// ============ MISE À JOUR DES LIMITES ============

export async function updateTransferLimits(
  phone: string,
  amount: number
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    await db.update(transfertLimits)
      .set({
        totalJournalier: sql`COALESCE(${transfertLimits.totalJournalier}::numeric, 0) + ${amount}`,
        totalMensuel: sql`COALESCE(${transfertLimits.totalMensuel}::numeric, 0) + ${amount}`,
        nombreTransfertJour: sql`COALESCE(${transfertLimits.nombreTransfertJour}, 0) + 1`,
        nombreTransfertMois: sql`COALESCE(${transfertLimits.nombreTransfertMois}, 0) + 1`,
        dernierTransfert: new Date(),
        updatedAt: new Date()
      })
      .where(eq(transfertLimits.telephone, phone));
  } catch (error) {
    console.error('Erreur mise à jour limites:', error);
  }
}

// ============ WEBHOOK SECURITY ============

export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    return false;
  }
}

// ============ RATE LIMITING POUR TRANSFERTS ============

const transferRateLimits = new Map<string, { count: number; resetTime: number }>();

export function checkTransferRateLimit(
  key: string,  // Peut être IP, téléphone, ou combinaison
  maxRequests: number = 5,
  windowMs: number = 60000  // 1 minute par défaut
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = transferRateLimits.get(key);

  if (!record || record.resetTime < now) {
    transferRateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetTime: record.resetTime };
}

// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of Array.from(transferRateLimits.entries())) {
    if (record.resetTime < now) {
      transferRateLimits.delete(key);
    }
  }
}, 60000);

console.log('[Transfer Security Service] Initialisé avec les normes CEMAC/BEAC');
