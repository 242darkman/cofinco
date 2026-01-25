import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database
const mockSelect = vi.fn();

const createMockBuilder = (result: any = []) => {
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve(Array.isArray(result) ? result : [result]),
  };
  return builder;
};

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

import {
  resolveChannels,
  resolveOtpChannel,
} from '../services/notifications/policy/routing-policy';

describe('Routing Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // RESOLVE CHANNELS
  // ===========================================================================

  describe('resolveChannels', () => {
    it('should default to SMS when no settings found', async () => {
      // No agency settings, no global settings
      mockSelect.mockImplementation(() => createMockBuilder([]));

      const result = await resolveChannels();

      expect(result.channels).toContain('SMS');
    });

    it('should return SMS only for SMS_ONLY policy', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'SMS_ONLY',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels();

      expect(result.channels).toEqual(['SMS']);
    });

    it('should return EMAIL only for EMAIL_ONLY policy', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'EMAIL_ONLY',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels();

      expect(result.channels).toEqual(['EMAIL']);
    });

    it('should return SMS then EMAIL for SMS_THEN_EMAIL policy', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'SMS_THEN_EMAIL',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels();

      expect(result.channels).toEqual(['SMS', 'EMAIL']);
    });

    it('should return EMAIL then SMS for EMAIL_THEN_SMS policy', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'EMAIL_THEN_SMS',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels();

      expect(result.channels).toEqual(['EMAIL', 'SMS']);
    });

    it('should use preferred channel if enabled', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'SMS_ONLY',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels(undefined, 'EMAIL');

      expect(result.channels).toEqual(['EMAIL']);
    });

    it('should fall back to policy when preferred channel is disabled', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: false,
          pushEnabled: false,
          fallbackPolicy: 'SMS_ONLY',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels(undefined, 'EMAIL');

      expect(result.channels).toEqual(['SMS']);
    });

    it('should skip disabled channels in fallback', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: false,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'SMS_THEN_EMAIL',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const result = await resolveChannels();

      // SMS disabled, so only EMAIL
      expect(result.channels).toEqual(['EMAIL']);
    });
  });

  // ===========================================================================
  // RESOLVE OTP CHANNEL
  // ===========================================================================

  describe('resolveOtpChannel', () => {
    it('should return SMS by default', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'SMS_ONLY',
          otpChannel: 'SMS',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const channel = await resolveOtpChannel();
      expect(channel).toBe('SMS');
    });

    it('should return EMAIL when configured', async () => {
      mockSelect.mockImplementation(() =>
        createMockBuilder([{
          id: '1',
          agenceId: null,
          smsEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          fallbackPolicy: 'SMS_ONLY',
          otpChannel: 'EMAIL',
          otpMaxPerMinute: 3,
          otpMaxPerDay: 20,
          smsQuotaDaily: 1000,
          emailQuotaDaily: 500,
        }])
      );

      const channel = await resolveOtpChannel();
      expect(channel).toBe('EMAIL');
    });

    it('should default to SMS when no settings found', async () => {
      mockSelect.mockImplementation(() => createMockBuilder([]));

      const channel = await resolveOtpChannel();
      expect(channel).toBe('SMS');
    });
  });
});
