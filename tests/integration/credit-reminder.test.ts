import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Integration tests for credit reminder schedule generation.
// Tests generateCreditReminderSchedule with mocked DB.
// ============================================================================

const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

// Chain builder for SELECT queries
function mockSelectChain(result: any) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(result),
        }),
      }),
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

vi.mock('server/db', () => ({
  db: {
    select: vi.fn(),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock('@shared/schema', () => ({
  credits: { id: 'id', clientId: 'clientId', statut: 'statut' },
  clients: { id: 'id', userId: 'userId' },
  notificationSchedules: {
    sourceId: 'sourceId',
    sourceType: 'sourceType',
    status: 'status',
    scheduleVersion: 'scheduleVersion',
  },
}));

vi.mock('@shared/schema/auth', () => ({
  users: { id: 'id', telephone: 'telephone' },
}));

import { db } from 'server/db';
import {
  generateCreditReminderSchedule,
  cancelCreditReminders,
} from 'server/services/notifications/credit-reminder-service';

describe('Credit Reminder Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fake time to make reminders deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockCreditData = {
    credit: {
      id: 'credit-001',
      clientId: 'client-001',
      statut: 'ACTIVE',
      dateDebut: '2026-01-01',
      duree: 6,
      echeance: 'MONTHLY',
      montantEcheance: '100000',
      numeroCredit: 'CR-2026-001',
      agenceId: 'agence-001',
    },
    telephone: '+243812345678',
    userId: 'user-001',
  };

  describe('generateCreditReminderSchedule', () => {
    it('should throw if credit not found', async () => {
      (db.select as any).mockReturnValue(mockSelectChain([]));

      await expect(
        generateCreditReminderSchedule('nonexistent-credit')
      ).rejects.toThrow('not found');
    });

    it('should return 0 if no phone number', async () => {
      (db.select as any).mockReturnValue(
        mockSelectChain([{ ...mockCreditData, telephone: null }])
      );

      const count = await generateCreditReminderSchedule('credit-001');
      expect(count).toBe(0);
    });

    it('should return 0 if credit is not ACTIVE or LATE', async () => {
      (db.select as any).mockReturnValue(
        mockSelectChain([{
          ...mockCreditData,
          credit: { ...mockCreditData.credit, statut: 'PENDING' },
        }])
      );

      const count = await generateCreditReminderSchedule('credit-001');
      expect(count).toBe(0);
    });

    it('should return 0 if credit has no start date', async () => {
      (db.select as any).mockReturnValue(
        mockSelectChain([{
          ...mockCreditData,
          credit: { ...mockCreditData.credit, dateDebut: null },
        }])
      );

      const count = await generateCreditReminderSchedule('credit-001');
      expect(count).toBe(0);
    });

    it('should generate reminders for active credit with valid data', async () => {
      // First select: load credit data
      (db.select as any)
        .mockReturnValueOnce(mockSelectChain([mockCreditData]))
        // Second select: get current schedule version
        .mockReturnValueOnce(mockSelectChain([])); // no existing version

      const count = await generateCreditReminderSchedule('credit-001');

      // 6 monthly periods × 6 offsets = 36 reminders
      expect(count).toBe(36);

      // Verify insert was called with batches
      expect(mockInsert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalled();
    });

    it('should cancel previous schedules before generating new ones', async () => {
      (db.select as any)
        .mockReturnValueOnce(mockSelectChain([mockCreditData]))
        .mockReturnValueOnce(mockSelectChain([{ maxVersion: 2 }])); // existing version

      await generateCreditReminderSchedule('credit-001');

      // Should have called update to cancel previous
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
        })
      );
    });

    it('should generate reminders for LATE credits too', async () => {
      const lateCreditData = {
        ...mockCreditData,
        credit: { ...mockCreditData.credit, statut: 'LATE' },
      };

      (db.select as any)
        .mockReturnValueOnce(mockSelectChain([lateCreditData]))
        .mockReturnValueOnce(mockSelectChain([]));

      const count = await generateCreditReminderSchedule('credit-001');
      expect(count).toBeGreaterThan(0);
    });

    it('should batch insert reminders in groups of 100', async () => {
      // Create a credit with many periods to exceed batch size
      const manyPeriodsCreditData = {
        ...mockCreditData,
        credit: { ...mockCreditData.credit, duree: 24 }, // 24 months
      };

      (db.select as any)
        .mockReturnValueOnce(mockSelectChain([manyPeriodsCreditData]))
        .mockReturnValueOnce(mockSelectChain([]));

      const count = await generateCreditReminderSchedule('credit-001');

      // 24 periods × 6 offsets = 144 reminders -> 2 batches (100 + 44)
      expect(count).toBe(144);
      expect(mockInsert).toHaveBeenCalledTimes(2); // Two batches
    });
  });

  describe('cancelCreditReminders', () => {
    it('should cancel all PENDING reminders for a credit', async () => {
      await cancelCreditReminders('credit-001', 'Crédit clôturé');

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          cancelReason: 'Crédit clôturé',
        })
      );
    });

    it('should use default reason when not provided', async () => {
      await cancelCreditReminders('credit-001');

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelReason: 'Crédit clôturé',
        })
      );
    });
  });
});
