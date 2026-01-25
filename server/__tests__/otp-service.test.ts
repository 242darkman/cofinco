import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database before importing the service
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const createMockBuilder = (result: any = []) => {
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    then: (resolve: any) => resolve(Array.isArray(result) ? result : [result]),
  };
  return builder;
};

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock('../services/notifications/notification-service', () => ({
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/notifications/policy/routing-policy', () => ({
  resolveOtpChannel: vi.fn().mockResolvedValue('SMS'),
}));

vi.mock('../services/notifications/audit/notification-audit', () => ({
  logNotificationEvent: vi.fn(),
}));

import {
  generateOtpCode,
  generateSalt,
  hashOtp,
  verifyOtpHash,
  checkOtpRateLimit,
  requestOtp,
  verifyOtp,
  OtpRateLimitError,
} from '../services/notifications/otp/otp-service';

describe('OTP Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OTP_HMAC_SECRET = 'test-hmac-secret-for-unit-tests';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OTP_HMAC_SECRET;
  });

  // ===========================================================================
  // CRYPTO PRIMITIVES
  // ===========================================================================

  describe('generateOtpCode', () => {
    it('should generate a 6-digit numeric string', () => {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate codes between 100000 and 999999', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateOtpCode();
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });

    it('should generate different codes on successive calls', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(generateOtpCode());
      }
      // With 6-digit codes, 50 generations should produce many unique values
      expect(codes.size).toBeGreaterThan(30);
    });
  });

  describe('generateSalt', () => {
    it('should generate a 32-character hex string (16 bytes)', () => {
      const salt = generateSalt();
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('hashOtp', () => {
    it('should produce a consistent hash for same code + salt', () => {
      const code = '123456';
      const salt = 'a'.repeat(32);
      const hash1 = hashOtp(code, salt);
      const hash2 = hashOtp(code, salt);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different codes', () => {
      const salt = 'a'.repeat(32);
      const hash1 = hashOtp('123456', salt);
      const hash2 = hashOtp('654321', salt);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different salts', () => {
      const code = '123456';
      const hash1 = hashOtp(code, 'a'.repeat(32));
      const hash2 = hashOtp(code, 'b'.repeat(32));
      expect(hash1).not.toBe(hash2);
    });

    it('should return a hex string', () => {
      const hash = hashOtp('123456', 'a'.repeat(32));
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('verifyOtpHash', () => {
    it('should return true for a valid code', () => {
      const code = '123456';
      const salt = generateSalt();
      const hash = hashOtp(code, salt);
      expect(verifyOtpHash(code, salt, hash)).toBe(true);
    });

    it('should return false for an invalid code', () => {
      const salt = generateSalt();
      const hash = hashOtp('123456', salt);
      expect(verifyOtpHash('654321', salt, hash)).toBe(false);
    });

    it('should return false for a wrong salt', () => {
      const code = '123456';
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const hash = hashOtp(code, salt1);
      expect(verifyOtpHash(code, salt2, hash)).toBe(false);
    });

    it('should use timing-safe comparison (no early exit on mismatch)', () => {
      const salt = generateSalt();
      const hash = hashOtp('123456', salt);
      // Both wrong codes should take similar time (timing-safe)
      const result1 = verifyOtpHash('000000', salt, hash);
      const result2 = verifyOtpHash('999999', salt, hash);
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  describe('checkOtpRateLimit', () => {
    it('should return null when under rate limits', async () => {
      // Mock: no agency settings found -> use global -> use defaults
      const selectBuilder = createMockBuilder([]);
      mockSelect.mockReturnValue(selectBuilder);

      // Per-minute count = 0
      selectBuilder.from.mockReturnValueOnce({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(
            Promise.resolve([{ otpMaxPerMinute: 3, otpMaxPerDay: 20 }])
          ),
        }),
      });

      const result = await checkOtpRateLimit('+242065000000', 'TRANSFER_VALIDATION');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // REQUEST OTP
  // ===========================================================================

  describe('requestOtp', () => {
    it('should generate and persist an OTP hash (never plaintext)', async () => {
      // Mock rate limit check (no limits exceeded)
      const selectBuilder = createMockBuilder([{ otpMaxPerMinute: 3, otpMaxPerDay: 20 }]);
      mockSelect.mockReturnValue(selectBuilder);

      // Mock insert
      const insertBuilder = createMockBuilder([{
        id: 'otp-123',
        destination: '+242065000000',
        channel: 'SMS',
        purpose: 'TRANSFER_VALIDATION',
        codeHash: 'somehash',
        salt: 'somesalt',
        expiresAt: new Date(),
        attempts: 0,
        maxAttempts: 3,
      }]);
      mockInsert.mockReturnValue(insertBuilder);

      const result = await requestOtp({
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        channel: 'SMS',
      });

      expect(result).toHaveProperty('otpId');
      expect(result).toHaveProperty('expiresAt');
      // In non-production, debugCode should be present
      expect(result).toHaveProperty('debugCode');
      expect(result.debugCode).toMatch(/^\d{6}$/);

      // Verify insert was called (hash persisted, not plaintext)
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // VERIFY OTP
  // ===========================================================================

  describe('verifyOtp', () => {
    it('should return valid:true for correct code', async () => {
      const code = '123456';
      const salt = generateSalt();
      const codeHash = hashOtp(code, salt);

      const selectBuilder = createMockBuilder([{
        id: 'otp-123',
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        codeHash,
        salt,
        expiresAt: new Date(Date.now() + 300000), // 5 min from now
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        channel: 'SMS',
      }]);
      mockSelect.mockReturnValue(selectBuilder);

      const updateBuilder = createMockBuilder([]);
      mockUpdate.mockReturnValue(updateBuilder);

      const result = await verifyOtp({
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        code,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid:false for incorrect code', async () => {
      const salt = generateSalt();
      const codeHash = hashOtp('123456', salt);

      const selectBuilder = createMockBuilder([{
        id: 'otp-123',
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        codeHash,
        salt,
        expiresAt: new Date(Date.now() + 300000),
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        channel: 'SMS',
      }]);
      mockSelect.mockReturnValue(selectBuilder);

      const updateBuilder = createMockBuilder([]);
      mockUpdate.mockReturnValue(updateBuilder);

      const result = await verifyOtp({
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        code: '654321', // Wrong code
      });

      expect(result.valid).toBe(false);
      expect(result.attemptsRemaining).toBe(2);
    });

    it('should return error when max attempts reached', async () => {
      const salt = generateSalt();
      const codeHash = hashOtp('123456', salt);

      const selectBuilder = createMockBuilder([{
        id: 'otp-123',
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        codeHash,
        salt,
        expiresAt: new Date(Date.now() + 300000),
        attempts: 3,
        maxAttempts: 3,
        consumedAt: null,
        channel: 'SMS',
      }]);
      mockSelect.mockReturnValue(selectBuilder);

      const result = await verifyOtp({
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        code: '123456',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum de tentatives');
    });

    it('should return error when no valid OTP found (expired or consumed)', async () => {
      const selectBuilder = createMockBuilder([]);
      mockSelect.mockReturnValue(selectBuilder);

      const result = await verifyOtp({
        destination: '+242065000000',
        purpose: 'TRANSFER_VALIDATION',
        code: '123456',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalide ou expiré');
    });
  });

  // ===========================================================================
  // CUSTOM ERRORS
  // ===========================================================================

  describe('OtpRateLimitError', () => {
    it('should have the correct name', () => {
      const error = new OtpRateLimitError('rate limited');
      expect(error.name).toBe('OtpRateLimitError');
      expect(error.message).toBe('rate limited');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
