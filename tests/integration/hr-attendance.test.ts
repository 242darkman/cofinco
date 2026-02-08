
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// MOCK MIDDLEWARE
vi.mock('server/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'agent' };
    next();
  },
  requireRole: () => (req: any, res: any, next: any) => next()
}));

// MOCK AUTHORIZATION (routes use attachAbility/requireAbility)
vi.mock('server/authorization', () => ({
  attachAbility: (req: any, res: any, next: any) => next(),
  requireAbility: () => (req: any, res: any, next: any) => next()
}));

// MOCK DB
vi.mock('server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }
}));

// MOCK STORAGE — include getEmployeByUserId (checkin/checkout resolves employee first)
vi.mock('server/storage', () => ({
  storage: {
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    getPresenceAujourdhui: vi.fn(),
    getEmployeByUserId: vi.fn(),
  }
}));

// MOCK WS SERVER
vi.mock('server/ws-server', () => ({
  getWsInstance: () => ({ broadcast: vi.fn() })
}));

// MOCK deep dependencies imported by HR routes
vi.mock('server/services/notifications/domain-events/event-registry', () => ({
  dispatchDomainEvent: vi.fn(),
}));
vi.mock('server/services/hr-service', () => ({
  hrService: { generateMonthlyPayroll: vi.fn(), logAction: vi.fn() },
  HrService: class {},
}));
vi.mock('server/services/hiring-approval-service', () => ({ hiringApprovalService: {} }));
vi.mock('server/services/sanction-escalation-service', () => ({ sanctionEscalationService: {} }));
vi.mock('server/services/onboarding-service', () => ({ onboardingService: {} }));
vi.mock('server/services/hr-accounting-service', () => ({
  postPayrollEngagement: vi.fn(), postPayrollPayment: vi.fn(),
  postAdvancePayment: vi.fn(), postAdvanceDeduction: vi.fn(),
}));
vi.mock('server/services/hr-import-service', () => ({ importEmployees: vi.fn(), parseCsv: vi.fn() }));
vi.mock('server/services/storage-service', () => ({
  StorageService: { getPresignedDownloadUrl: vi.fn(), uploadFile: vi.fn() }
}));

import { hrRouter } from 'server/routes/hr';
import { storage } from 'server/storage';

const app = express();
app.use(express.json());
app.use('/api/hr', hrRouter);

describe('HR Attendance Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Route resolves userId → employeId via getEmployeByUserId before calling checkIn/checkOut
        (storage.getEmployeByUserId as any).mockResolvedValue({ id: 'emp-1', userId: 'test-user', nom: 'Test' });
    });

    it('POST /api/hr/presence/checkin should record check-in', async () => {
        (storage.checkIn as any).mockResolvedValue({ id: 1, statut: 'Présent' });

        const res = await request(app).post('/api/hr/presence/checkin');

        expect(res.status).toBe(200);
        expect(storage.getEmployeByUserId).toHaveBeenCalledWith('test-user');
        expect(storage.checkIn).toHaveBeenCalledWith('emp-1', undefined);
        expect(res.body.statut).toBe('Présent');
    });

    it('POST /api/hr/presence/checkout should record check-out', async () => {
        (storage.checkOut as any).mockResolvedValue({ id: 1, statut: 'Présent', heureDepart: '18:00' });

        const res = await request(app).post('/api/hr/presence/checkout');

        expect(res.status).toBe(200);
        expect(storage.checkOut).toHaveBeenCalledWith('emp-1');
    });

    it('GET /api/hr/presence/today should return stats', async () => {
        const mockStats = { presents: 10, absents: 2 };
        (storage.getPresenceAujourdhui as any).mockResolvedValue(mockStats);

        const res = await request(app).get('/api/hr/presence/today');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockStats);
    });
});
