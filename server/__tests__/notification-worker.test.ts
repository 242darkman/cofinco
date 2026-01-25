import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all dependencies
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockExecute = vi.fn();

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    update: (...args: any[]) => mockUpdate(...args),
    execute: (...args: any[]) => mockExecute(...args),
  },
}));

vi.mock('../services/notifications/templates/template-engine', () => ({
  renderSmsTemplate: vi.fn().mockResolvedValue('Rendered SMS message'),
  renderEmailTemplate: vi.fn().mockResolvedValue({
    subject: 'Test Subject',
    html: '<p>Test</p>',
    text: 'Test',
  }),
}));

vi.mock('../services/notifications/policy/routing-policy', () => ({
  resolveSmsProviderName: vi.fn().mockResolvedValue('mtn'),
}));

vi.mock('../services/notifications/policy/rate-limiter', () => ({
  checkChannelQuota: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/notifications/audit/notification-audit', () => ({
  logNotificationEvent: vi.fn(),
}));

import {
  startNotificationWorker,
  stopNotificationWorker,
  isNotificationWorkerRunning,
} from '../services/notifications/notification-worker';

describe('Notification Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopNotificationWorker();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  describe('lifecycle', () => {
    it('should start and report running status', () => {
      expect(isNotificationWorkerRunning()).toBe(false);

      startNotificationWorker();

      expect(isNotificationWorkerRunning()).toBe(true);
    });

    it('should stop cleanly', () => {
      startNotificationWorker();
      expect(isNotificationWorkerRunning()).toBe(true);

      stopNotificationWorker();
      expect(isNotificationWorkerRunning()).toBe(false);
    });

    it('should not double-start', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      startNotificationWorker();
      startNotificationWorker(); // Second call should be no-op

      expect(isNotificationWorkerRunning()).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  describe('configuration', () => {
    it('should export lifecycle functions', () => {
      expect(typeof startNotificationWorker).toBe('function');
      expect(typeof stopNotificationWorker).toBe('function');
      expect(typeof isNotificationWorkerRunning).toBe('function');
    });
  });
});
