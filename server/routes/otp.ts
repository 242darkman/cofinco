import type { Express } from "express";
import { storage } from "../storage";
import { insertOtpValidationSchema } from "@shared/schema";
import { requireAuth } from "../auth";
import { z } from "zod";
import {
  requestOtp,
  verifyOtp,
  OtpRateLimitError,
} from "../services/notifications/otp/otp-service";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const requestOtpSchema = z.object({
  destination: z.string().min(1, "destination est requis"),
  channel: z.enum(["SMS", "EMAIL"]).optional(),
  purpose: z.enum([
    "PASSWORD_RESET",
    "TRANSFER_VALIDATION",
    "CREDIT_VALIDATION",
    "SECURITY_CHANGE",
    "CAISSE_OPERATION",
  ]),
  templatePayload: z.record(z.unknown()).optional(),
});

const verifyOtpSchema = z.object({
  destination: z.string().min(1, "destination est requis"),
  purpose: z.enum([
    "PASSWORD_RESET",
    "TRANSFER_VALIDATION",
    "CREDIT_VALIDATION",
    "SECURITY_CHANGE",
    "CAISSE_OPERATION",
  ]),
  code: z.string().length(6, "Le code doit faire 6 chiffres"),
});

export function registerOtpRoutes(app: Express) {

  // ========================================================================
  // NEW SECURE ENDPOINTS (hashed OTP, rate-limited)
  // ========================================================================

  /**
   * POST /api/otp/request
   * Request a new OTP code (hashed, rate-limited, delivered via notification worker).
   */
  app.post("/api/otp/request", requireAuth, async (req, res) => {
    try {
      const parsed = requestOtpSchema.parse(req.body);
      const user = req.session.user;

      const result = await requestOtp({
        userId: user?.id,
        destination: parsed.destination,
        channel: parsed.channel,
        purpose: parsed.purpose,
        templatePayload: parsed.templatePayload,
        agenceId: user?.agenceId,
        ipAddress: req.ip,
      });

      // Generic response - don't reveal if destination exists
      res.json({
        success: true,
        otpId: result.otpId,
        expiresAt: result.expiresAt.toISOString(),
        ...(result.debugCode ? { debugCode: result.debugCode } : {}),
      });
    } catch (error: any) {
      if (error instanceof OtpRateLimitError) {
        return res.status(429).json({
          success: false,
          error: error.message,
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Données invalides",
          details: error.errors,
        });
      }
      console.error("OTP Request Error:", error);
      res.status(500).json({ success: false, error: "Erreur interne" });
    }
  });

  /**
   * POST /api/otp/verify
   * Verify an OTP code (timing-safe comparison against hash).
   */
  app.post("/api/otp/verify", requireAuth, async (req, res) => {
    try {
      const parsed = verifyOtpSchema.parse(req.body);

      const result = await verifyOtp({
        destination: parsed.destination,
        purpose: parsed.purpose,
        code: parsed.code,
      });

      if (result.valid) {
        return res.json({ success: true });
      }

      // Generic error response (anti-enumeration)
      return res.status(400).json({
        success: false,
        error: result.error,
        attemptsRemaining: result.attemptsRemaining,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Données invalides",
          details: error.errors,
        });
      }
      console.error("OTP Verify Error:", error);
      res.status(500).json({ success: false, error: "Erreur interne" });
    }
  });

  // ========================================================================
  // LEGACY ENDPOINTS (kept for backward compatibility, marked deprecated)
  // ========================================================================

  /**
   * @deprecated Use POST /api/otp/request instead.
   * Generate OTP (legacy - stores plaintext code).
   */
  app.post("/api/otp/generate", requireAuth, async (req, res) => {
    try {
      const { transactionType, transactionReference, clientId, clientPhone, montant, createdBy, createdByRole } = req.body;

      if (!transactionReference || !clientPhone) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Generate 6-digit code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // 5 minutes expiration
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const otpData = {
        transactionType,
        transactionReference,
        clientId,
        clientPhone,
        montant: montant.toString(),
        otpCode,
        createdBy,
        createdByRole,
        expiresAt,
        status: 'pending'
      };

      const parsed2 = insertOtpValidationSchema.parse(otpData);
      const otpRecord = await storage.createOtpValidation(parsed2);

      // Simulate SMS sending (log to console)
      console.log(`[SMS MOCK] Sending OTP ${otpCode} to ${clientPhone} for transaction ${transactionReference}`);

      res.json({
        success: true,
        otp_id: otpRecord.id,
        expires_at: expiresAt.toISOString(),
        otp_code_debug: otpCode // For testing/demo purposes
      });

    } catch (error: any) {
      console.error("OTP Generation Error:", error);
      res.status(500).json({ error: "impossibleGenererOtp", details: error.message });
    }
  });

  /**
   * @deprecated Use POST /api/otp/verify instead.
   * Validate OTP (legacy - plaintext comparison).
   */
  app.post("/api/otp/validate", requireAuth, async (req, res) => {
    try {
      const { transactionReference, otpCode, validatedByRole } = req.body;

      if (!transactionReference || !otpCode) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const otpRecord = await storage.getOtpByReference(transactionReference);

      if (!otpRecord) {
        return res.status(404).json({ error: "codeInvalide" }); // Generic error for security
      }

      if (otpRecord.statut === 'validated') {
        return res.json({ success: true, message: "Already validated" }); // Idempotency
      }

      if (otpRecord.statut !== 'pending') {
        return res.status(400).json({ error: "otpExpiredOrInvalid" });
      }

      if (new Date() > new Date(otpRecord.expiresAt)) {
        await storage.updateOtpStatus(otpRecord.id, 'expired');
        return res.status(400).json({ error: "codeExpire" });
      }

      if (otpRecord.attempts >= otpRecord.maxAttempts) {
         await storage.updateOtpStatus(otpRecord.id, 'failed');
         return res.status(400).json({ error: "maxTentativesAtteint" });
      }

      // Check code
      if (otpRecord.otpCode !== otpCode) {
        const attemptsUsed = (otpRecord.attempts || 0) + 1;
        await storage.updateOtpAttempts(otpRecord.id, attemptsUsed);
        const attemptsLeft = otpRecord.maxAttempts - attemptsUsed;

        return res.status(400).json({
          success: false,
          error: `codeInvalide. Tentatives restantes: ${attemptsLeft}`
        });
      }

      // Success
      const user = req.session.user;
      await storage.validateOtp(
        otpRecord.id,
        user?.id,
        user ? `${user.nom} ${user.prenom}` : 'System',
        validatedByRole || user?.role
      );

      res.json({ success: true });

    } catch (error: any) {
      console.error("OTP Validation Error:", error);
      res.status(500).json({ error: "erreurValidation", details: error.message });
    }
  });
}
