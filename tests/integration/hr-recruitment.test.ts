
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// MOCK MIDDLEWARE
vi.mock('../../apps/api/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'rh' };
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

// MOCK AUTHORIZATION
vi.mock('../../apps/api/authorization', () => ({
  attachAbility: (req: any, res: any, next: any) => next(),
  requireAbility: () => (req: any, res: any, next: any) => next()
}));

// MOCK WS SERVER
vi.mock('../../apps/api/ws-server', () => ({
  getWsInstance: () => ({ broadcast: vi.fn() })
}));

// MOCK STORAGE
vi.mock('../../apps/api/storage', () => ({
  storage: {}
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

import { hrRouter } from '../../apps/api/routes/hr';
import { db } from '../../apps/api/db';

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
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => resolve(result),
  };
};

describe('HR Recruitment Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (db.select as any).mockImplementation(() => mockQueryBuilder([]));
    });

    it('GET /api/hr/candidatures should return candidatures', async () => {
        const mockList = [{ id: 1, nom: 'Candidat 1' }];
        (db.select as any).mockReturnValue(mockQueryBuilder(mockList));

        const res = await request(app).get('/api/hr/candidatures');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('POST /api/hr/candidatures should create a candidature', async () => {
        const newCand = {
            nom: 'Doe',
            prenom: 'John',
            email: 'john@doe.com',
            posteVise: 'Dev'
        };

        (db.insert as any).mockReturnValue(mockQueryBuilder([{ id: 10, ...newCand }]));

        const res = await request(app).post('/api/hr/candidatures').send(newCand);

        expect(res.status).toBe(201);
        expect(db.insert).toHaveBeenCalled();
    });

    it('PATCH /api/hr/candidatures/:id should update status', async () => {
        // Use English enum value (StatutCandidature.INTERVIEW = "INTERVIEW")
        (db.update as any).mockReturnValue(mockQueryBuilder([{ id: 1, statut: 'INTERVIEW' }]));

        const res = await request(app).patch('/api/hr/candidatures/1').send({ statut: 'INTERVIEW' });

        expect(res.status).toBe(200);
        expect(res.body.statut).toBe('INTERVIEW');
    });
});
