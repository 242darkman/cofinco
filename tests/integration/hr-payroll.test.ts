
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// MOCK MIDDLEWARE
vi.mock('../../apps/api/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
}));

// MOCK DB
vi.mock('../../apps/api/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}));

// MOCK STORAGE
vi.mock('../../apps/api/storage', () => ({
  storage: {}
}));

// MOCK AUTHORIZATION
vi.mock('../../apps/api/authorization', () => ({
  attachAbility: (req: any, res: any, next: any) => next(),
  requireAbility: () => (req: any, res: any, next: any) => next()
}));

// MOCK WS SERVER
vi.mock('../../apps/api/ws-server', () => ({
  getWsInstance: () => ({ broadcast: vi.fn() })
}));

// MOCK deep dependencies
vi.mock('../../apps/api/services/notifications/domain-events/event-registry', () => ({
  dispatchDomainEvent: vi.fn(),
}));
vi.mock('../../apps/api/services/hr-service', () => ({
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
vi.mock('../../apps/api/services/hiring-approval-service', () => ({ hiringApprovalService: {} }));
vi.mock('../../apps/api/services/sanction-escalation-service', () => ({ sanctionEscalationService: {} }));
vi.mock('../../apps/api/services/onboarding-service', () => ({ onboardingService: {} }));
vi.mock('../../apps/api/services/hr-accounting-service', () => ({
  postPayrollEngagement: vi.fn(), postPayrollPayment: vi.fn(),
  postAdvancePayment: vi.fn(), postAdvanceDeduction: vi.fn(),
}));
vi.mock('../../apps/api/services/hr-import-service', () => ({ importEmployees: vi.fn(), parseCsv: vi.fn() }));
vi.mock('../../apps/api/services/storage-service', () => ({
  StorageService: { getPresignedDownloadUrl: vi.fn(), uploadFile: vi.fn() }
}));
vi.mock('../../apps/api/services/payroll-engine', () => ({
  generatePayrollRun: vi.fn(),
}));

import { hrRouter } from '../../apps/api/routes/hr';
import { db } from '../../apps/api/db';
import { generatePayrollRun } from '../../apps/api/services/payroll-engine';

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
        // generatePayrollRun returns { run, generated, skipped, issues, bulletins }
        vi.mocked(generatePayrollRun).mockResolvedValue({
            run: { id: 'run-1', mois: '2026-01', statut: 'COMPLETED' },
            generated: 1,
            skipped: 0,
            issues: [],
            bulletins: [{ id: 1, salaireNet: 1000 }]
        } as any);

        const res = await request(app).post('/api/hr/paie/generate').send({ mois: '2026-01' });

        expect(res.status).toBe(201);
        expect(generatePayrollRun).toHaveBeenCalledWith('2026-01', 'test-user', undefined);
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
