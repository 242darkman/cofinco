import type { Express, Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';
import { logAudit } from './audit';
import { createLogger } from './lib/logger';

const logger = createLogger('MobileMoney');
import {
  validateTransfer,
  checkBlacklist,
  checkTransferLimits,
  analyzeTransferRisk,
  logTransferAudit,
  updateTransferLimits,
  generateTransferReference,
  generateOTP,
  hashOTP,
  generateSecretCode,
  hashSecret,
  generateIdempotencyKey,
  checkTransferRateLimit,
  validateWebhookSignature,
  LIMITS_CEMAC,
  REGULATORY_LIMITS,
  type TransferRequest as SecureTransferRequest,
  type TransferValidationResult
} from './transfer-security-service';
import { db } from './db';
import { transferts, transfertAuditLogs, transfertLimits, kycLevels } from '@shared/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';

export interface MobileMoneyProvider {
  id: string;
  name: string;
  logo: string;
  countries: string[];
  currencies: string[];
  type: 'local' | 'international' | 'both';
  apiEndpoint?: string;
  fees: {
    fixed: number;
    percentage: number;
  };
  limits: {
    min: number;
    max: number;
    daily: number;
  };
  speed: string;
  requiresKYC: boolean;
}

export const mobileMoneyProviders: MobileMoneyProvider[] = [
  {
    id: 'airtel_money_cg',
    name: 'Airtel Money Congo',
    logo: '📱',
    countries: ['CG'],
    currencies: ['XAF'],
    type: 'local',
    fees: { fixed: 200, percentage: 0.3 },
    limits: { min: 500, max: 5000000, daily: 10000000 },
    speed: 'Instantané',
    requiresKYC: false
  },
  {
    id: 'mtn_momo_cg',
    name: 'MTN Mobile Money Congo',
    logo: '📲',
    countries: ['CG'],
    currencies: ['XAF'],
    type: 'local',
    fees: { fixed: 200, percentage: 0.3 },
    limits: { min: 500, max: 5000000, daily: 10000000 },
    speed: 'Instantané',
    requiresKYC: false
  },
  {
    id: 'mpesa',
    name: 'M-Pesa',
    logo: '💚',
    countries: ['KE', 'TZ', 'GH', 'CD', 'MZ', 'EG'],
    currencies: ['KES', 'TZS', 'GHS', 'CDF', 'MZN', 'EGP'],
    type: 'international',
    fees: { fixed: 1500, percentage: 1.2 },
    limits: { min: 5000, max: 10000000, daily: 20000000 },
    speed: '< 5 minutes',
    requiresKYC: true
  },
  {
    id: 'wave',
    name: 'Wave',
    logo: '🌊',
    countries: ['SN', 'CI', 'ML', 'BF', 'GM', 'UG'],
    currencies: ['XOF', 'UGX'],
    type: 'international',
    fees: { fixed: 1000, percentage: 1.0 },
    limits: { min: 5000, max: 15000000, daily: 30000000 },
    speed: 'Instantané',
    requiresKYC: true
  },
  {
    id: 'orange_money',
    name: 'Orange Money',
    logo: '🟠',
    countries: ['SN', 'CI', 'ML', 'BF', 'CM', 'CD', 'MG', 'GN'],
    currencies: ['XOF', 'XAF', 'CDF', 'MGA', 'GNF'],
    type: 'both',
    fees: { fixed: 1200, percentage: 1.5 },
    limits: { min: 5000, max: 10000000, daily: 20000000 },
    speed: '< 10 minutes',
    requiresKYC: true
  },
  {
    id: 'mtn_momo_intl',
    name: 'MTN Mobile Money',
    logo: '📲',
    countries: ['CM', 'CI', 'GH', 'NG', 'UG', 'RW', 'BJ', 'CD'],
    currencies: ['XAF', 'XOF', 'GHS', 'NGN', 'UGX', 'RWF', 'CDF'],
    type: 'international',
    fees: { fixed: 1500, percentage: 1.3 },
    limits: { min: 5000, max: 10000000, daily: 20000000 },
    speed: '< 10 minutes',
    requiresKYC: true
  },
  {
    id: 'moov_money',
    name: 'Moov Money',
    logo: '🔵',
    countries: ['CI', 'BJ', 'TG', 'NE', 'CF', 'GA'],
    currencies: ['XOF', 'XAF'],
    type: 'international',
    fees: { fixed: 1000, percentage: 1.2 },
    limits: { min: 5000, max: 8000000, daily: 15000000 },
    speed: '< 15 minutes',
    requiresKYC: true
  },
  {
    id: 'free_money',
    name: 'Free Money',
    logo: '🔴',
    countries: ['SN'],
    currencies: ['XOF'],
    type: 'international',
    fees: { fixed: 800, percentage: 1.0 },
    limits: { min: 5000, max: 5000000, daily: 10000000 },
    speed: 'Instantané',
    requiresKYC: true
  },
  {
    id: 'ecocash',
    name: 'EcoCash',
    logo: '🌿',
    countries: ['ZW', 'ZM'],
    currencies: ['ZWL', 'ZMW'],
    type: 'international',
    fees: { fixed: 2000, percentage: 2.0 },
    limits: { min: 10000, max: 5000000, daily: 10000000 },
    speed: '< 30 minutes',
    requiresKYC: true
  },
  {
    id: 'tigo_pesa',
    name: 'Tigo Pesa',
    logo: '💙',
    countries: ['TZ', 'GH', 'RW'],
    currencies: ['TZS', 'GHS', 'RWF'],
    type: 'international',
    fees: { fixed: 1500, percentage: 1.5 },
    limits: { min: 5000, max: 8000000, daily: 15000000 },
    speed: '< 15 minutes',
    requiresKYC: true
  },
  {
    id: 'zamtel_kwacha',
    name: 'Zamtel Kwacha',
    logo: '💛',
    countries: ['ZM'],
    currencies: ['ZMW'],
    type: 'international',
    fees: { fixed: 2000, percentage: 1.8 },
    limits: { min: 10000, max: 5000000, daily: 10000000 },
    speed: '< 30 minutes',
    requiresKYC: true
  }
];

export const exchangeRates: Record<string, number> = {
  'XAF': 1,
  'XOF': 1,
  'EUR': 0.00152,
  'USD': 0.00167,
  'GBP': 0.00131,
  'CDF': 4.15,
  'NGN': 2.68,
  'GHS': 0.021,
  'KES': 0.23,
  'TZS': 4.2,
  'UGX': 6.2,
  'RWF': 2.1,
  'ZAR': 0.031,
  'ZMW': 0.043,
  'MGA': 7.5,
  'GNF': 14.3
};

export interface TransferRequest {
  senderName: string;
  senderPhone: string;
  senderIdType: string;
  senderIdNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientCountry: string;
  amount: number;
  currency: string;
  providerId: string;
  purpose: string;
}

export interface TransferResponse {
  success: boolean;
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  senderAmount: number;
  senderCurrency: string;
  recipientAmount: number;
  recipientCurrency: string;
  fees: number;
  exchangeRate: number;
  estimatedDelivery: string;
  providerReference?: string;
  message?: string;
}

export function calculateTransferFees(
  amount: number,
  providerId: string,
  recipientCurrency: string
): { fees: number; recipientAmount: number; rate: number } {
  const provider = mobileMoneyProviders.find(p => p.id === providerId);
  if (!provider) {
    return { fees: 0, recipientAmount: 0, rate: 1 };
  }

  const fees = provider.fees.fixed + (amount * provider.fees.percentage / 100);
  const rate = (exchangeRates[recipientCurrency] || 1) / exchangeRates['XAF'];
  const recipientAmount = (amount - fees) * rate;

  return { fees, recipientAmount, rate };
}

export async function initiateTransfer(request: TransferRequest): Promise<TransferResponse> {
  const provider = mobileMoneyProviders.find(p => p.id === request.providerId);
  if (!provider) {
    return {
      success: false,
      transactionId: '',
      status: 'failed',
      senderAmount: request.amount,
      senderCurrency: 'XAF',
      recipientAmount: 0,
      recipientCurrency: request.currency,
      fees: 0,
      exchangeRate: 0,
      estimatedDelivery: '',
      message: 'Fournisseur non trouvé'
    };
  }

  if (request.amount < provider.limits.min || request.amount > provider.limits.max) {
    return {
      success: false,
      transactionId: '',
      status: 'failed',
      senderAmount: request.amount,
      senderCurrency: 'XAF',
      recipientAmount: 0,
      recipientCurrency: request.currency,
      fees: 0,
      exchangeRate: 0,
      estimatedDelivery: '',
      message: `Montant hors limites (${provider.limits.min.toLocaleString()} - ${provider.limits.max.toLocaleString()} XAF)`
    };
  }

  const { fees, recipientAmount, rate } = calculateTransferFees(
    request.amount,
    request.providerId,
    request.currency
  );

  const { randomBytes } = require('crypto');
  const transactionId = `TRF${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').slice(0, 4).toUpperCase()}`;

  return {
    success: true,
    transactionId,
    status: 'processing',
    senderAmount: request.amount,
    senderCurrency: 'XAF',
    recipientAmount,
    recipientCurrency: request.currency,
    fees,
    exchangeRate: rate,
    estimatedDelivery: provider.speed,
    providerReference: `${provider.id.toUpperCase()}-${Date.now()}`,
    message: `Transfert vers ${request.recipientName} via ${provider.name} en cours`
  };
}

// Rate limiter spécifique pour les transferts (plus strict)
const transferRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requêtes par minute
  message: { error: 'Trop de tentatives de transfert. Réessayez dans 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// OTP Store sécurisé avec hachage et liaison transaction/utilisateur
interface SecureOTPRecord {
  hashedCode: string;      // Code OTP hashé (jamais en clair)
  salt: string;            // Sel unique pour ce code
  expiry: Date;
  attempts: number;
  maxAttempts: number;
  phone: string;           // Lié au téléphone de l'expéditeur
  userId?: string;         // Lié à l'agent si connecté
  transferData: object;    // Données du transfert pour validation
  createdAt: Date;
}

const otpStore = new Map<string, SecureOTPRecord>();

// Stocker les clés d'idempotence avec expiration
interface IdempotencyRecord {
  result: any;
  timestamp: number;
  expiresAt: number;
}

const idempotencyStore = new Map<string, IdempotencyRecord>();

// Taux de tentatives OTP globales par téléphone (protection brute force)
const otpRateLimits = new Map<string, { count: number; windowStart: number }>();

// Vérifier le rate limit OTP
function checkOtpRateLimit(phone: string): { allowed: boolean; waitSeconds: number } {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxAttempts = 5;
  
  const record = otpRateLimits.get(phone);
  if (!record || (now - record.windowStart) > windowMs) {
    otpRateLimits.set(phone, { count: 1, windowStart: now });
    return { allowed: true, waitSeconds: 0 };
  }
  
  if (record.count >= maxAttempts) {
    const waitMs = windowMs - (now - record.windowStart);
    return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) };
  }
  
  record.count++;
  return { allowed: true, waitSeconds: 0 };
}

// Nettoyer périodiquement les stores
setInterval(() => {
  const now = Date.now();
  
  // Nettoyer idempotency store (24h)
  Array.from(idempotencyStore.entries()).forEach(([key, value]) => {
    if (now > value.expiresAt) {
      idempotencyStore.delete(key);
    }
  });
  
  // Nettoyer OTP store (expirés)
  Array.from(otpStore.entries()).forEach(([key, value]) => {
    if (new Date() > value.expiry) {
      otpStore.delete(key);
    }
  });
  
  // Nettoyer rate limits (fenêtres expirées)
  const windowMs = 5 * 60 * 1000;
  Array.from(otpRateLimits.entries()).forEach(([key, value]) => {
    if ((now - value.windowStart) > windowMs) {
      otpRateLimits.delete(key);
    }
  });
}, 30000); // Toutes les 30 secondes

export function registerMobileMoneyRoutes(app: Express) {
  // ========== Routes publiques (lecture seule) ==========
  
  app.get('/api/mobile-money/providers', (req, res) => {
    const { country, type } = req.query;
    let providers = mobileMoneyProviders;

    if (country) {
      providers = providers.filter(p => p.countries.includes(country as string));
    }

    if (type) {
      providers = providers.filter(p => p.type === type || p.type === 'both');
    }

    res.json(providers);
  });

  app.get('/api/mobile-money/rates', (req, res) => {
    res.json(exchangeRates);
  });

  app.post('/api/mobile-money/calculate', (req, res) => {
    const { amount, providerId, recipientCurrency } = req.body;
    const result = calculateTransferFees(amount, providerId, recipientCurrency);
    res.json(result);
  });

  app.get('/api/mobile-money/countries', (req, res) => {
    const countries = [
      { code: 'CG', name: 'Congo (Brazzaville)', currency: 'XAF', flag: '🇨🇬', providers: ['airtel_money_cg', 'mtn_momo_cg'] },
      { code: 'CD', name: 'RD Congo', currency: 'CDF', flag: '🇨🇩', providers: ['mpesa', 'orange_money', 'mtn_momo_intl'] },
      { code: 'CM', name: 'Cameroun', currency: 'XAF', flag: '🇨🇲', providers: ['orange_money', 'mtn_momo_intl'] },
      { code: 'SN', name: 'Sénégal', currency: 'XOF', flag: '🇸🇳', providers: ['wave', 'orange_money', 'free_money'] },
      { code: 'CI', name: 'Côte d\'Ivoire', currency: 'XOF', flag: '🇨🇮', providers: ['wave', 'orange_money', 'mtn_momo_intl', 'moov_money'] },
      { code: 'ML', name: 'Mali', currency: 'XOF', flag: '🇲🇱', providers: ['wave', 'orange_money'] },
      { code: 'BF', name: 'Burkina Faso', currency: 'XOF', flag: '🇧🇫', providers: ['wave', 'orange_money'] },
      { code: 'KE', name: 'Kenya', currency: 'KES', flag: '🇰🇪', providers: ['mpesa'] },
      { code: 'TZ', name: 'Tanzanie', currency: 'TZS', flag: '🇹🇿', providers: ['mpesa', 'tigo_pesa'] },
      { code: 'GH', name: 'Ghana', currency: 'GHS', flag: '🇬🇭', providers: ['mpesa', 'mtn_momo_intl', 'tigo_pesa'] },
      { code: 'NG', name: 'Nigeria', currency: 'NGN', flag: '🇳🇬', providers: ['mtn_momo_intl'] },
      { code: 'UG', name: 'Ouganda', currency: 'UGX', flag: '🇺🇬', providers: ['wave', 'mtn_momo_intl'] },
      { code: 'RW', name: 'Rwanda', currency: 'RWF', flag: '🇷🇼', providers: ['mtn_momo_intl', 'tigo_pesa'] },
      { code: 'BJ', name: 'Bénin', currency: 'XOF', flag: '🇧🇯', providers: ['mtn_momo_intl', 'moov_money'] },
      { code: 'TG', name: 'Togo', currency: 'XOF', flag: '🇹🇬', providers: ['moov_money'] },
      { code: 'GA', name: 'Gabon', currency: 'XAF', flag: '🇬🇦', providers: ['moov_money'] },
      { code: 'CF', name: 'Centrafrique', currency: 'XAF', flag: '🇨🇫', providers: ['moov_money'] },
      { code: 'MG', name: 'Madagascar', currency: 'MGA', flag: '🇲🇬', providers: ['orange_money'] },
      { code: 'ZM', name: 'Zambie', currency: 'ZMW', flag: '🇿🇲', providers: ['zamtel_kwacha', 'ecocash'] },
      { code: 'ZW', name: 'Zimbabwe', currency: 'ZWL', flag: '🇿🇼', providers: ['ecocash'] }
    ];
    res.json(countries);
  });

  // Obtenir les limites CEMAC/BEAC
  app.get('/api/mobile-money/limits', (req, res) => {
    res.json({
      kycLevels: LIMITS_CEMAC,
      regulatory: {
        maxPerTransaction: 5000000,  // 5M XAF
        maxDaily: 10000000,          // 10M XAF
        requiresDocumentAbove: 500000 // Document requis au-dessus de 500K
      }
    });
  });

  // ========== Routes sécurisées (requièrent authentification) ==========

  // Valider un transfert AVANT de l'initier (pré-validation)
  app.post('/api/mobile-money/validate', requireAuth, async (req, res) => {
    try {
      const { 
        expediteurNom, expediteurTelephone, expediteurEmail,
        expediteurTypeDocument, expediteurNumeroDocument,
        beneficiaireNom, beneficiaireTelephone, beneficiairePays,
        montantEnvoye, deviseEnvoi, deviseReception,
        operateurId, modeReception, modePaiement, motifTransfert
      } = req.body;

      const ip = req.ip || req.socket?.remoteAddress;
      const userAgent = req.get('User-Agent');

      // Validation complète
      const validation = await validateTransfer({
        expediteurNom,
        expediteurTelephone,
        expediteurEmail,
        expediteurTypeDocument,
        expediteurNumeroDocument,
        beneficiaireNom,
        beneficiaireTelephone,
        beneficiairePays,
        montantEnvoye,
        deviseEnvoi,
        deviseReception,
        operateurId,
        modeReception,
        modePaiement,
        motifTransfert
      }, ip, userAgent);

      res.json(validation);
    } catch (error: any) {
      logger.error({ err: error }, 'Validation error');
      res.status(500).json({ 
        valid: false, 
        errors: ['Erreur de validation interne'],
        warnings: [],
        riskScore: 0,
        riskFlags: [],
        requiresOtp: false,
        requiresApproval: false,
        limits: { remainingDaily: 0, remainingMonthly: 0, currentKycLevel: 1 }
      });
    }
  });

  // Initier un transfert sécurisé
  app.post('/api/mobile-money/transfer', requireAuth, transferRateLimiter, async (req, res) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress;
      const userAgent = req.get('User-Agent');
      const userId = (req.session as any)?.userId;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      // VALIDATION OBLIGATOIRE des champs essentiels AVANT tout traitement
      const senderPhone = req.body.senderPhone || req.body.expediteurTelephone;
      const recipientPhone = req.body.recipientPhone || req.body.beneficiaireTelephone;
      const senderName = req.body.senderName || req.body.expediteurNom;
      const recipientName = req.body.recipientName || req.body.beneficiaireNom;
      const amount = req.body.amount || req.body.montantEnvoye;
      const recipientCountry = req.body.recipientCountry || req.body.beneficiairePays;
      const operatorId = req.body.providerId || req.body.operateurId;

      // Vérification des champs obligatoires
      const missingFields: string[] = [];
      if (!senderPhone) missingFields.push('téléphone expéditeur');
      if (!senderName) missingFields.push('nom expéditeur');
      if (!recipientPhone) missingFields.push('téléphone bénéficiaire');
      if (!recipientName) missingFields.push('nom bénéficiaire');
      if (!amount || amount <= 0) missingFields.push('montant');
      if (!recipientCountry) missingFields.push('pays de destination');
      if (!operatorId) missingFields.push('opérateur');

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          errors: [`Champs obligatoires manquants: ${missingFields.join(', ')}`],
          message: 'Veuillez remplir tous les champs obligatoires'
        });
      }

      // Vérification d'idempotence
      if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
        const cached = idempotencyStore.get(idempotencyKey);
        return res.json(cached!.result);
      }

      // Rate limiting supplémentaire par téléphone (maintenant garanti non-undefined)
      const phoneRateCheck = checkTransferRateLimit(
        `phone:${senderPhone}`,
        3,
        60000 // 3 transferts par minute max
      );
      
      if (!phoneRateCheck.allowed) {
        await logAudit(req, 'transfer_rate_limited', 'transfer', userId, {
          phone: senderPhone,
          resetIn: phoneRateCheck.resetTime - Date.now()
        }, 'blocked', 'medium');
        
        return res.status(429).json({
          success: false,
          message: 'Limite de transferts atteinte. Réessayez dans quelques secondes.',
          retryAfter: Math.ceil((phoneRateCheck.resetTime - Date.now()) / 1000)
        });
      }

      // Convertir la requête au format interne (champs maintenant validés)
      const transferRequest: SecureTransferRequest = {
        expediteurNom: req.body.senderName || req.body.expediteurNom,
        expediteurTelephone: req.body.senderPhone || req.body.expediteurTelephone,
        expediteurEmail: req.body.senderEmail,
        expediteurTypeDocument: req.body.senderIdType || req.body.expediteurTypeDocument,
        expediteurNumeroDocument: req.body.senderIdNumber || req.body.expediteurNumeroDocument,
        beneficiaireNom: req.body.recipientName || req.body.beneficiaireNom,
        beneficiaireTelephone: req.body.recipientPhone || req.body.beneficiaireTelephone,
        beneficiairePays: req.body.recipientCountry || req.body.beneficiairePays,
        montantEnvoye: req.body.amount || req.body.montantEnvoye,
        deviseEnvoi: req.body.currency || 'XAF',
        deviseReception: req.body.recipientCurrency || req.body.deviseReception || 'XAF',
        operateurId: req.body.providerId || req.body.operateurId,
        modeReception: req.body.modeReception || 'mobile_money',
        modePaiement: req.body.modePaiement || 'cash',
        motifTransfert: req.body.purpose || req.body.motifTransfert
      };

      // Validation de sécurité
      const validation = await validateTransfer(transferRequest, ip, userAgent);
      
      if (!validation.valid) {
        await logAudit(req, 'transfer_validation_failed', 'transfer', userId, {
          errors: validation.errors,
          riskScore: validation.riskScore,
          riskFlags: validation.riskFlags
        }, 'failure', validation.riskScore > 50 ? 'high' : 'medium');

        return res.status(400).json({
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
          riskScore: validation.riskScore
        });
      }

      // Générer référence et codes
      const reference = generateTransferReference();
      const secretCode = generateSecretCode();
      
      // Si OTP requis
      if (validation.requiresOtp) {
        const otp = generateOTP();
        const salt = generateSecretCode(); // Sel unique
        const hashedCode = hashOTP(otp, salt);
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        
        // Stocker l'OTP hashé avec liaison utilisateur/transaction
        otpStore.set(reference, { 
          hashedCode,
          salt,
          expiry: otpExpiry, 
          attempts: 0,
          maxAttempts: 3,
          phone: transferRequest.expediteurTelephone,
          userId,
          transferData: transferRequest,
          createdAt: new Date()
        });
        
        // En production: envoyer OTP par SMS via le service SMS
        logger.info({ phone: transferRequest.expediteurTelephone }, 'OTP generated for transfer validation');

        return res.json({
          success: true,
          status: 'otp_required',
          reference,
          message: 'Code OTP envoyé par SMS',
          requiresOtp: true,
          otpExpiresIn: 300 // 5 minutes
        });
      }

      // BLOCAGE SÉCURISÉ: Transactions nécessitant approbation manuelle
      if (validation.requiresApproval) {
        await logAudit(req, 'transfer_requires_approval', 'transfer', userId, {
          reference,
          amount: transferRequest.montantEnvoye,
          recipient: transferRequest.beneficiaireTelephone,
          country: transferRequest.beneficiairePays,
          operator: transferRequest.operateurId,
          riskScore: validation.riskScore,
          riskFlags: validation.riskFlags,
          status: 'pending_approval'
        }, 'blocked', 'high');

        // NE PAS mettre à jour les limites - transfert en attente d'approbation
        return res.status(202).json({
          success: true,
          status: 'pending_approval',
          reference,
          message: 'Cette transaction nécessite une approbation manuelle par un superviseur. Vous serez notifié une fois la décision prise.',
          riskScore: validation.riskScore,
          warnings: validation.warnings,
          estimatedReviewTime: '< 24 heures'
        });
      }

      // Calculer les frais (seulement pour transactions validées)
      const { fees, recipientAmount, rate } = calculateTransferFees(
        transferRequest.montantEnvoye,
        transferRequest.operateurId,
        transferRequest.deviseReception
      );

      const provider = mobileMoneyProviders.find(p => p.id === transferRequest.operateurId);

      // Audit - transfert initié (pas d'approbation requise)
      await logAudit(req, 'transfer_initiated', 'transfer', userId, {
        reference,
        amount: transferRequest.montantEnvoye,
        recipient: transferRequest.beneficiaireTelephone,
        country: transferRequest.beneficiairePays,
        operator: transferRequest.operateurId,
        riskScore: validation.riskScore
      }, 'success', 'medium');

      // Mettre à jour les limites (seulement si transfert approuvé automatiquement)
      await updateTransferLimits(
        transferRequest.expediteurTelephone,
        transferRequest.montantEnvoye
      );

      const result = {
        success: true,
        transactionId: reference,
        status: 'processing',
        senderAmount: transferRequest.montantEnvoye,
        senderCurrency: transferRequest.deviseEnvoi,
        recipientAmount,
        recipientCurrency: transferRequest.deviseReception,
        fees,
        exchangeRate: rate,
        estimatedDelivery: provider?.speed || '< 30 minutes',
        providerReference: `${transferRequest.operateurId.toUpperCase()}-${Date.now()}`,
        secretCode: validation.riskScore < 25 ? secretCode : undefined,
        message: `Transfert vers ${transferRequest.beneficiaireNom} via ${provider?.name || 'Mobile Money'} en cours`,
        limits: validation.limits
      };

      // Stocker pour idempotence (avec expiration 24h)
      if (idempotencyKey) {
        const now = Date.now();
        idempotencyStore.set(idempotencyKey, { 
          result, 
          timestamp: now,
          expiresAt: now + (24 * 60 * 60 * 1000) // 24h
        });
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Transfer error');
      await logAudit(req, 'transfer_error', 'transfer', (req.session as any)?.userId, {
        error: error.message
      }, 'failure', 'high');
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors du transfert'
      });
    }
  });

  // Vérifier et valider OTP
  app.post('/api/mobile-money/verify-otp', requireAuth, async (req, res) => {
    try {
      const { reference, otp } = req.body;
      const userId = (req.session as any)?.userId;

      if (!reference || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Référence et code OTP requis'
        });
      }

      const storedOtp = otpStore.get(reference);

      if (!storedOtp) {
        return res.status(400).json({
          success: false,
          message: 'Code OTP expiré ou invalide'
        });
      }

      // Vérifier expiration
      if (new Date() > storedOtp.expiry) {
        otpStore.delete(reference);
        await logAudit(req, 'otp_expired', 'transfer', userId, { reference }, 'failure', 'low');
        return res.status(400).json({
          success: false,
          message: 'Code OTP expiré. Veuillez réinitier le transfert.'
        });
      }

      // Vérifier tentatives
      if (storedOtp.attempts >= 3) {
        otpStore.delete(reference);
        await logAudit(req, 'otp_max_attempts', 'transfer', userId, { reference }, 'blocked', 'high');
        return res.status(400).json({
          success: false,
          message: 'Trop de tentatives. Transfert annulé.'
        });
      }

      // Vérifier le code avec le hash sécurisé
      const hashedInputOtp = hashOTP(otp, storedOtp.salt);
      if (storedOtp.hashedCode !== hashedInputOtp) {
        storedOtp.attempts++;
        await logAudit(req, 'otp_invalid', 'transfer', userId, { 
          reference, 
          attemptsRemaining: storedOtp.maxAttempts - storedOtp.attempts 
        }, 'failure', 'medium');
        
        return res.status(400).json({
          success: false,
          message: `Code incorrect. ${storedOtp.maxAttempts - storedOtp.attempts} tentatives restantes.`
        });
      }

      // OTP valide
      otpStore.delete(reference);
      await logAudit(req, 'otp_verified', 'transfer', userId, { reference }, 'success', 'low');

      res.json({
        success: true,
        message: 'Code OTP vérifié. Transfert en cours de traitement.',
        status: 'processing',
        reference
      });
    } catch (error: any) {
      logger.error({ err: error }, 'OTP verification error');
      res.status(500).json({
        success: false,
        message: 'Erreur de vérification'
      });
    }
  });

  // Renvoyer OTP
  app.post('/api/mobile-money/resend-otp', requireAuth, async (req, res) => {
    try {
      const { reference } = req.body;
      const userId = (req.session as any)?.userId;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Référence requise'
        });
      }

      const existingOtp = otpStore.get(reference);
      
      // Rate limit: pas plus d'un renvoi toutes les 30 secondes
      const rateLimitKey = `resend:${reference}`;
      const rateCheck = checkTransferRateLimit(rateLimitKey, 1, 30000);
      
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          message: 'Veuillez patienter avant de demander un nouveau code',
          retryAfter: Math.ceil((rateCheck.resetTime - Date.now()) / 1000)
        });
      }

      // Vérifier si l'OTP existant est valide et obtenir les données du transfert
      if (!existingOtp) {
        return res.status(400).json({
          success: false,
          message: 'Référence de transfert non trouvée ou expirée'
        });
      }

      // Générer nouveau code sécurisé
      const newOtp = generateOTP();
      const newSalt = generateSecretCode();
      const hashedCode = hashOTP(newOtp, newSalt);
      const expiry = new Date(Date.now() + 5 * 60 * 1000);
      
      // Mettre à jour avec nouveau code (conserver les tentatives précédentes)
      otpStore.set(reference, { 
        hashedCode,
        salt: newSalt,
        expiry, 
        attempts: existingOtp.attempts,
        maxAttempts: existingOtp.maxAttempts,
        phone: existingOtp.phone,
        userId: existingOtp.userId,
        transferData: existingOtp.transferData,
        createdAt: existingOtp.createdAt
      });

      // En production: envoyer par SMS via le service SMS
      logger.info({ reference, phone: existingOtp.phone }, 'OTP resent');
      
      await logAudit(req, 'otp_resent', 'transfer', userId, { reference }, 'success', 'low');

      res.json({
        success: true,
        message: 'Nouveau code OTP envoyé par SMS',
        expiresIn: 300
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Resend OTP error');
      res.status(500).json({
        success: false,
        message: 'Erreur lors du renvoi du code'
      });
    }
  });

  // Obtenir les limites personnelles du client
  app.get('/api/mobile-money/my-limits', requireAuth, async (req, res) => {
    try {
      const phone = req.query.phone as string;
      
      if (!phone) {
        return res.status(400).json({ error: 'Numéro de téléphone requis' });
      }

      const limits = await checkTransferLimits(phone, 0, 1);
      
      res.json({
        allowed: limits.allowed,
        remaining: limits.remaining,
        kycLevel: 1,
        limits: LIMITS_CEMAC.KYC_LEVEL_1
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Get limits error');
      res.status(500).json({ error: 'Erreur lors de la récupération des limites' });
    }
  });

  // Historique des transferts (pour l'agent connecté)
  app.get('/api/mobile-money/history', requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;
      
      // Note: Cette route retournerait les transferts de la DB une fois les tables créées
      // Pour l'instant, retourner un exemple
      res.json({
        transfers: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          totalPages: 0
        }
      });
    } catch (error: any) {
      logger.error({ err: error }, 'History error');
      res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
    }
  });

  // Legacy route (backward compatibility)
  app.post('/api/mobile-money/transfer-legacy', async (req, res) => {
    try {
      const result = await initiateTransfer(req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du transfert'
      });
    }
  });

  logger.info('Mobile Money routes registered with rate limiting and OTP');
}
