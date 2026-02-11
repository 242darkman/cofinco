/**
 * Security Middleware Configuration
 *
 * Ce fichier centralise toutes les configurations de sécurité pour l'API :
 * - Rate Limiting (protection contre brute force et DDoS applicatif)
 * - Helmet (headers de sécurité HTTP)
 *
 * Configuration Bank-Grade pour une application financière.
 */

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = !isProduction;

// En développement, désactiver le rate limiting (limites très élevées)
const DEV_MAX = 10000; // Pratiquement illimité en dev

// ============================================================================
// RATE LIMITERS
// ============================================================================

/**
 * Limiteur pour les endpoints d'authentification
 * Très strict pour prévenir les attaques par force brute
 *
 * - Max 5 tentatives de login par 15 minutes par IP (PROD)
 * - Désactivé en développement
 * - Ne compte pas les requêtes réussies (skipSuccessfulRequests)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? DEV_MAX : 5, // Désactivé en dev
  message: {
    error: "Trop de tentatives de connexion, réessayez dans 15 minutes",
    retryAfter: 15 * 60, // secondes
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: true, // Ne pas compter les logins réussis
  skip: () => isDevelopment, // Skip complètement en dev
  // Default keyGenerator uses req.ip which handles IPv6 properly
  // when trust proxy is set (app.set('trust proxy', 1))
});

/**
 * Limiteur standard pour l'API
 * Protège contre le spam sans bloquer les utilisateurs légitimes
 *
 * - Max 200 requêtes par 15 minutes par IP (PROD)
 * - Désactivé en développement
 * - Suffisant pour les agents actifs en agence
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? DEV_MAX : 200, // Désactivé en dev
  message: {
    error: "Trop de requêtes, veuillez réessayer plus tard",
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment, // Skip complètement en dev
});

/**
 * Limiteur pour les opérations sensibles
 * Virements, validations de crédits, transactions financières
 *
 * - Max 20 opérations par minute par IP (PROD)
 * - Désactivé en développement
 * - Prévient les abus sans bloquer le workflow normal
 */
export const sensitiveOpsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? DEV_MAX : 20, // Désactivé en dev
  message: {
    error: "Opération trop fréquente, veuillez patienter",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment, // Skip complètement en dev
});

/**
 * Limiteur pour les uploads de fichiers
 * Prévient l'abus de stockage
 *
 * - Max 30 uploads par minute (PROD)
 * - Désactivé en développement
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? DEV_MAX : 30, // Désactivé en dev
  message: {
    error: "Trop de fichiers uploadés, veuillez patienter",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment, // Skip complètement en dev
});

// ============================================================================
// HELMET CONFIGURATION (Security Headers)
// ============================================================================

/**
 * Content Security Policy (CSP) pour la production
 * Strict, avec allowlist pour les ressources externes nécessaires
 */
const productionCSP = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Nécessaire pour certains composants UI
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com",
      "https://unpkg.com",
    ],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: [
      "'self'",
      "data:", // Pour les images base64
      "https:", // Pour les images externes (MinIO, etc.)
      "blob:", // Pour les previews d'upload
    ],
    scriptSrc: ["'self'"], // Strict: pas d'inline scripts
    connectSrc: [
      "'self'",
      "https:", // API calls
      "wss:", // WebSocket connections
    ],
    frameSrc: ["'none'"], // Pas d'iframes
    objectSrc: ["'none'"], // Pas de plugins (Flash, etc.)
    baseUri: ["'self'"], // Restriction du <base> tag
    formAction: ["'self'"], // Restriction des soumissions de formulaires
    frameAncestors: ["'none'"], // Clickjacking protection
    upgradeInsecureRequests: [], // Force HTTPS
  },
};

/**
 * CSP pour le développement
 * Plus permissif pour permettre le HMR de Vite
 */
const developmentCSP = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com",
      "https://unpkg.com",
    ],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:", "blob:"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Nécessaire pour Vite HMR
      "'unsafe-eval'", // Nécessaire pour les sourcemaps
    ],
    connectSrc: ["'self'", "https:", "wss:", "ws:"], // ws: pour HMR
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    // upgradeInsecureRequests omitted in dev (localhost HTTP)
  },
};

/**
 * Configuration Helmet complète
 * Headers de sécurité bank-grade
 */
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: isProduction ? productionCSP : developmentCSP,

  // Cross-Origin policies
  crossOriginEmbedderPolicy: false, // Désactivé pour permettre les images externes
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Permet le chargement cross-origin

  // HTTP Strict Transport Security (HSTS)
  // Force HTTPS pendant 1 an, inclut les sous-domaines
  hsts: isProduction ? {
    maxAge: 31536000, // 1 an en secondes
    includeSubDomains: true,
    preload: true, // Permet l'inclusion dans la liste HSTS preload
  } : false, // Désactivé en dev (localhost HTTP)

  // Referrer Policy
  // Envoie l'origin uniquement pour les requêtes same-origin ou cross-origin vers HTTPS
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },

  // X-Content-Type-Options: nosniff
  // Empêche le MIME type sniffing
  noSniff: true,

  // X-XSS-Protection (legacy, mais garde pour vieux navigateurs)
  xssFilter: true,

  // X-Frame-Options: DENY
  // Protection contre le clickjacking (complète frameAncestors CSP)
  frameguard: { action: "deny" },

  // X-DNS-Prefetch-Control
  // Contrôle le prefetching DNS
  dnsPrefetchControl: { allow: false },

  // X-Download-Options: noopen (IE specific)
  ieNoOpen: true,

  // X-Permitted-Cross-Domain-Policies
  // Pour Flash/PDF (legacy mais ne coûte rien)
  permittedCrossDomainPolicies: { permittedPolicies: "none" },

  // Origin-Agent-Cluster header
  originAgentCluster: true,
});

// ============================================================================
// ADDITIONAL SECURITY MIDDLEWARE
// ============================================================================

/**
 * Middleware pour masquer les informations de version serveur
 * Supprime tout header qui pourrait révéler des infos techniques
 */
export const hideServerInfo = (_req: Request, res: Response, next: NextFunction) => {
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
};

/**
 * Middleware pour ajouter des headers de sécurité supplémentaires
 * Complète la configuration Helmet
 */
export const additionalSecurityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // Permissions Policy (anciennement Feature Policy)
  // Désactive les fonctionnalités sensibles non utilisées
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );

  // Cache-Control pour les réponses API
  // Empêche le caching de données sensibles
  if (_req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  helmetConfig,
  authLimiter,
  apiLimiter,
  sensitiveOpsLimiter,
  uploadLimiter,
  hideServerInfo,
  additionalSecurityHeaders,
};
