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

vi.mock('server/db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { MtnSmsProvider } from 'server/services/notifications/providers/sms-mtn.provider';

const MTN_SETTINGS = {
  id: '1',
  provider: 'mtn',
  providerName: 'mtn',
  isActive: true,
  isPrimary: false,
  settings: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    tokenUrl: 'https://api.mtn.com/v1/oauth/access_token/accesstoken?grant_type=client_credentials',
    smsBaseUrl: 'https://api.mtn.com/v2/messages/sms/outbound',
  },
};

const TOKEN_RESPONSE = {
  access_token: 'test-access-token-12345',
  expires_in: 3600,
  token_type: 'Bearer',
};

describe('MtnSmsProvider', () => {
  let provider: MtnSmsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MtnSmsProvider();
    provider.invalidateSettings(); // Clear cached settings + token

    // Default: DB returns MTN settings
    mockSelect.mockImplementation(() => createMockBuilder([MTN_SETTINGS]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    provider.invalidateSettings();
  });

  // ===========================================================================
  // SEND SMS
  // ===========================================================================

  describe('send', () => {
    it('should acquire token and send SMS successfully', async () => {
      // Mock: token request + SMS send
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            resourceReference: { resourceURL: 'https://api.mtn.com/sms/123' },
            requestId: 'req-abc',
          }),
        });

      const result = await provider.send('+242065000000', 'Test message', {
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify token request
      const [tokenUrl, tokenOpts] = mockFetch.mock.calls[0];
      expect(tokenUrl).toContain('oauth');
      expect(tokenOpts.method).toBe('POST');
      expect(tokenOpts.headers.Authorization).toContain('Basic');

      // Verify SMS send
      const [smsUrl, smsOpts] = mockFetch.mock.calls[1];
      expect(smsUrl).toContain('sms/outbound');
      expect(smsOpts.headers.Authorization).toContain('Bearer');
      const body = JSON.parse(smsOpts.body);
      expect(body.receiverAddress[0]).toMatch(/^tel:\+242/);
      expect(body.message).toBe('Test message');
      expect(body.clientCorrelator).toBe('corr-123');
    });

    it('should truncate message to 160 characters', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ requestId: 'req-1' }),
        });

      const longMessage = 'A'.repeat(200);
      await provider.send('+242065000000', longMessage);

      const [, smsOpts] = mockFetch.mock.calls[1];
      const body = JSON.parse(smsOpts.body);
      expect(body.message.length).toBe(160);
    });

    it('should truncate correlationId to 36 chars', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ requestId: 'req-1' }),
        });

      const longId = 'x'.repeat(50);
      await provider.send('+242065000000', 'Hello', { correlationId: longId });

      const [, smsOpts] = mockFetch.mock.calls[1];
      const body = JSON.parse(smsOpts.body);
      expect(body.clientCorrelator.length).toBe(36);
    });

    it('should format phone numbers to tel:+242 format', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ requestId: 'req-1' }),
        });

      await provider.send('065000000', 'Hello');

      const [, smsOpts] = mockFetch.mock.calls[1];
      const body = JSON.parse(smsOpts.body);
      expect(body.receiverAddress[0]).toBe('tel:+24265000000');
    });

    it('should return error on MTN API failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            serviceException: { text: 'Invalid sender address' },
          }),
        });

      const result = await provider.send('+242065000000', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid sender address');
    });
  });

  // ===========================================================================
  // TOKEN CACHING
  // ===========================================================================

  describe('token caching', () => {
    it('should reuse cached token on second call', async () => {
      // First call: token + send
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ requestId: 'req-1' }),
        })
        // Second call: only send (token cached)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ requestId: 'req-2' }),
        });

      await provider.send('+242065000000', 'First');
      await provider.send('+242065000000', 'Second');

      // 3 fetch calls total: 1 token + 2 sends (not 2 tokens + 2 sends)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ===========================================================================
  // 401 RETRY
  // ===========================================================================

  describe('401 retry', () => {
    it('should refresh token and retry on 401', async () => {
      mockFetch
        // Initial token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        // First send attempt -> 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Token expired' }),
        })
        // Token refresh
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...TOKEN_RESPONSE, access_token: 'new-token' }),
        })
        // Retry send -> success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ requestId: 'req-retry' }),
        });

      const result = await provider.send('+242065000000', 'Hello');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(4); // token, send(401), token-refresh, send(ok)
    });
  });

  // ===========================================================================
  // DELIVERY STATUS
  // ===========================================================================

  describe('checkDeliveryStatus', () => {
    it('should return delivery status from MTN API', async () => {
      mockFetch
        // Token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        // Delivery status
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deliveryInfoList: {
              deliveryInfo: [{ deliveryStatus: 'DeliveredToTerminal' }],
            },
          }),
        });

      const result = await provider.checkDeliveryStatus('req-123', 'tel:+242COFIN');

      expect(result.status).toBe('DeliveredToTerminal');
    });

    it('should return UNKNOWN when delivery info missing', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => TOKEN_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const result = await provider.checkDeliveryStatus('req-123', 'tel:+242COFIN');

      expect(result.status).toBe('UNKNOWN');
    });
  });

  // ===========================================================================
  // SETTINGS
  // ===========================================================================

  describe('invalidateSettings', () => {
    it('should force re-load settings from DB', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => TOKEN_RESPONSE })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ requestId: 'r1' }) });

      await provider.send('+242065000000', 'Hello');
      const callCount = mockSelect.mock.calls.length;

      provider.invalidateSettings();

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => TOKEN_RESPONSE })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ requestId: 'r2' }) });

      await provider.send('+242065000000', 'Hello again');

      // Should have queried DB again for settings
      expect(mockSelect.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  describe('error handling', () => {
    it('should throw when MTN provider not configured', async () => {
      mockSelect.mockImplementation(() => createMockBuilder([]));

      const result = await provider.send('+242065000000', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error).toContain('MTN SMS provider not configured');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      // Need to mock loadSettings since it uses DB
      mockSelect.mockImplementation(() => createMockBuilder([MTN_SETTINGS]));

      // Force invalidate to re-call loadSettings
      provider.invalidateSettings();

      const result = await provider.send('+242065000000', 'Hello');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
