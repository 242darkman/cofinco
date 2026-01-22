import type { Express } from "express";
import { storage } from "../storage";
import { insertOtpValidationSchema } from "@shared/schema";
import { requireAuth } from "../auth";
import { z } from "zod";

export function registerOtpRoutes(app: Express) {
  
  // Generate OTP
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

      const parsed = insertOtpValidationSchema.parse(otpData);
      const otpRecord = await storage.createOtpValidation(parsed);

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

  // Validate OTP
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
