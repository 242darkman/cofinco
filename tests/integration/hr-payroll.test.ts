
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// MOCK MIDDLEWARE
vi.mock('server/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
  requireRole: (roles: any) => (req: any, res: any, next: any) => next()
}));

// MOCK DB
vi.mock('server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}));

// MOCK STORAGE
vi.mock('server/storage', () => ({
  storage: {}
}));

// MOCK AUTHORIZATION
vi.mock('server/authorization', () => ({
  attachAbility: (req: any, res: any, next: any) => next(),
  requireAbility: () => (req: any, res: any, next: any) => next()
}));

// MOCK WS SERVER
vi.mock('server/ws-server', () => ({
  getWsInstance: () => ({ broadcast: vi.fn() })
}));

// MOCK deep dependencies
vi.mock('server/services/notifications/domain-events/event-registry', () => ({
  dispatchDomainEvent: vi.fn(),
}));
vi.mock('server/services/hr-service', () => ({
  hrService: {
    generateMonthlyPayroll: vi.fn(),
    logAction: vi.fn().mockResolvedValue(undefined),
    validateLeaveRequest: vi.fn().mockResolvedValue({ valid: true }),
    onLeaveApproved: vi.fn().mockResolvedValue(undefined),
    createLeavePresenceEntries: vi.fn().mockResolvedValue(undefined),
    calculateBusinessDays: vi.fn().mockReturnValue(0),
  },
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
import { db } from 'server/db';
import { hrService } from 'server/services/hr-service';

const app = express();
app.use(express.json());
app.use('/api/hr', hrRouter);

// Helper for DB chaining
const mockQueryBuilder = (result: any) => {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => resolve(result),
  };
};

describe('HR Payroll Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (db.select as any).mockImplementation(() => mockQueryBuilder([]));
    });

    it('POST /api/hr/paie/generate should trigger payroll generation', async () => {
        // hrService.generateMonthlyPayroll returns { generated, skipped, bulletins }
        (hrService.generateMonthlyPayroll as any).mockResolvedValue({
            generated: 1,
            skipped: 0,
            bulletins: [{ id: 1, salaireNet: 1000 }]
        });

        const res = await request(app).post('/api/hr/paie/generate').send({ mois: '2026-01' });

        expect(res.status).toBe(201);
        expect(hrService.generateMonthlyPayroll).toHaveBeenCalledWith('2026-01', 'test-user', undefined);
        // Response wrapped in successResponse: { success: true, data: { bulletins: [...] } }
        expect(res.body.data.bulletins).toHaveLength(1);
    });

    it('GET /api/hr/bulletins should return list of bulletins', async () => {
        const mockBulletins = [{ id: 1, mois: '2026-01' }];
        (db.select as any).mockReturnValue(mockQueryBuilder(mockBulletins));

        const res = await request(app).get('/api/hr/bulletins');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('POST /api/hr/bulletins should archive a manual bulletin', async () => {
        const manualBulletin = {
            employeId: 'emp-1',
            employeNom: 'Test',
            mois: '2026-02',
            salaireBase: '100',
            salaireBrut: '100',
            salaireNet: '80',
            totalRetenues: '20',
            ipr: '10',
            cnssEmploye: '10',
            cnssPatronale: '10'
        };

        (db.select as any).mockReturnValue(mockQueryBuilder([])); // No existing bulletin
        (db.insert as any).mockReturnValue(mockQueryBuilder([{ id: 2, ...manualBulletin }]));

        const res = await request(app).post('/api/hr/bulletins').send(manualBulletin);

        expect(res.status).toBe(201);
        expect(db.insert).toHaveBeenCalled();
    });
});
