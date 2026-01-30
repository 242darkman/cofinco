import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Integration tests for the notification pipeline:
// Schedule → ReminderProcessor → enqueueNotification → mark SENT
// ============================================================================

const mockEnqueueNotification = vi.fn().mockResolvedValue('corr-id-123');
const mockSelectResult: any[] = [];
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: (...args: any[]) => mockUpdateSet(...args),
    }),
  },
}));

vi.mock('@shared/schema', () => ({
  notificationSchedules: {
    id: 'id',
    status: 'status',
    scheduledAt: 'scheduledAt',
    channel: 'channel',
    templateCode: 'templateCode',
    recipient: 'recipient',
  },
}));

vi.mock('../../server/services/notifications/notification-service', () => ({
  enqueueNotification: (...args: any[]) => mockEnqueueNotification(...args),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-0000-0000',
}));

import { processDueReminders, startReminderProcessor } from '../../server/services/notifications/reminder-processor';
import { db } from '../../server/db';

describe('Notification Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResult.length = 0;
  });

  describe('processDueReminders', () => {
    it('should return zero counts when no due reminders exist', async () => {
      // mockSelectResult is empty by default
      const result = await processDueReminders();

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should process and enqueue due reminders', async () => {
      const schedule = {
        id: 'sched-001',
        channel: 'SMS',
        templateCode: 'CREDIT_REMINDER_J3',
        recipient: '+243812345678',
        payload: { creditId: 'credit-001', montantEcheance: '100000' },
        userId: 'user-001',
        agenceId: 'agence-001',
        status: 'PENDING',
        scheduledAt: new Date('2025-01-01'),
      };
      mockSelectResult.push(schedule);

      const result = await processDueReminders();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);

      // Verify enqueue was called with correct params
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'SMS',
          templateCode: 'CREDIT_REMINDER_J3',
          recipient: '+243812345678',
          userId: 'user-001',
          agenceId: 'agence-001',
        })
      );

      // Verify schedule was marked as SENT
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'SENT',
        })
      );
    });

    it('should process multiple reminders in a single batch', async () => {
      mockSelectResult.push(
        {
          id: 'sched-001',
          channel: 'SMS',
          templateCode: 'CREDIT_DUE_TODAY',
          recipient: '+243812345678',
          payload: {},
          userId: 'user-001',
          agenceId: null,
          status: 'PENDING',
          scheduledAt: new Date(),
        },
        {
          id: 'sched-002',
          channel: 'SMS',
          templateCode: 'TONTINE_DUE_TODAY',
          recipient: '+243899999999',
          payload: {},
          userId: 'user-002',
          agenceId: null,
          status: 'PENDING',
          scheduledAt: new Date(),
        }
      );

      const result = await processDueReminders();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(2);
      expect(mockEnqueueNotification).toHaveBeenCalledTimes(2);
    });

    it('should mark schedule as SKIPPED when enqueue fails', async () => {
      mockEnqueueNotification.mockRejectedValueOnce(new Error('Provider unavailable'));

      mockSelectResult.push({
        id: 'sched-fail',
        channel: 'SMS',
        templateCode: 'CREDIT_OVERDUE_J1',
        recipient: '+243811111111',
        payload: {},
        userId: null,
        agenceId: null,
        status: 'PENDING',
        scheduledAt: new Date(),
      });

      const result = await processDueReminders();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].scheduleId).toBe('sched-fail');

      // Verify marked as SKIPPED
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'SKIPPED',
          cancelReason: 'Provider unavailable',
        })
      );
    });

    it('should continue processing remaining reminders after one fails', async () => {
      mockEnqueueNotification
        .mockRejectedValueOnce(new Error('Fail first'))
        .mockResolvedValueOnce('corr-2');

      mockSelectResult.push(
        {
          id: 'sched-a',
          channel: 'SMS',
          templateCode: 'CREDIT_REMINDER_J3',
          recipient: '+243811111111',
          payload: {},
          userId: null,
          agenceId: null,
          status: 'PENDING',
          scheduledAt: new Date(),
        },
        {
          id: 'sched-b',
          channel: 'SMS',
          templateCode: 'CREDIT_DUE_TODAY',
          recipient: '+243822222222',
          payload: {},
          userId: null,
          agenceId: null,
          status: 'PENDING',
          scheduledAt: new Date(),
        }
      );

      const result = await processDueReminders();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should handle null payload gracefully', async () => {
      mockSelectResult.push({
        id: 'sched-null-payload',
        channel: 'SMS',
        templateCode: 'TONTINE_REMINDER_J2',
        recipient: '+243800000000',
        payload: null,
        userId: null,
        agenceId: null,
        status: 'PENDING',
        scheduledAt: new Date(),
      });

      const result = await processDueReminders();

      expect(result.sent).toBe(1);
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {},
        })
      );
    });
  });

  describe('startReminderProcessor', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return a cleanup function', () => {
      const cleanup = startReminderProcessor(60_000);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should poll at the configured interval', async () => {
      const cleanup = startReminderProcessor(1000);

      // Advance timer by 3 seconds -> should have polled 3 times
      await vi.advanceTimersByTimeAsync(3000);

      // db.select should have been called for each poll
      expect(db.select).toHaveBeenCalled();

      cleanup();
    });

    it('should stop polling after cleanup', async () => {
      const cleanup = startReminderProcessor(1000);

      await vi.advanceTimersByTimeAsync(1000);
      const callCountBeforeCleanup = (db.select as any).mock.calls.length;

      cleanup();

      await vi.advanceTimersByTimeAsync(3000);
      const callCountAfterCleanup = (db.select as any).mock.calls.length;

      // No additional calls after cleanup
      expect(callCountAfterCleanup).toBe(callCountBeforeCleanup);
    });
  });
});
