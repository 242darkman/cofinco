
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// MOCK MIDDLEWARE
vi.mock('server/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
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

// MOCK AUTHORIZATION
vi.mock('server/authorization', () => ({
  attachAbility: (req: any, res: any, next: any) => next(),
  requireAbility: () => (req: any, res: any, next: any) => next()
}));

// MOCK WS SERVER
vi.mock('server/ws-server', () => ({
  getWsInstance: () => ({ broadcast: vi.fn() })
}));

// MOCK STORAGE
vi.mock('server/storage', () => ({
  storage: {
    getEmployeByUserId: vi.fn().mockResolvedValue(null),
  }
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
    onLeaveRequested: vi.fn().mockResolvedValue(undefined),
    onLeaveApproved: vi.fn().mockResolvedValue(undefined),
    createLeavePresenceEntries: vi.fn().mockResolvedValue(undefined),
    calculateBusinessDays: vi.fn().mockReturnValue(2),
    getAllLeaveBalances: vi.fn().mockResolvedValue([]),
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

describe('HR Leaves Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mocks
        (db.select as any).mockImplementation(() => mockQueryBuilder([]));
        (db.insert as any).mockImplementation(() => mockQueryBuilder([]));
        (db.update as any).mockImplementation(() => mockQueryBuilder([]));
    });

    it('GET /api/hr/conges should return list of leaves', async () => {
        const mockLeaves = [{ id: 1, type: 'Congé Annuel', statut: 'PENDING' }];
        (db.select as any).mockReturnValue(mockQueryBuilder(mockLeaves));

        const res = await request(app).get('/api/hr/conges');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].type).toBe('Congé Annuel');
    });

    it('POST /api/hr/conges should create a leave request', async () => {
        const newConge = {
            employeId: 'emp-1',
            employeNom: 'Test',
            type: 'Maladie',
            dateDebut: '2026-01-01',
            dateFin: '2026-01-02',
            motif: 'Grippe'
        };

        // Admin user → auto-approved (statut = APPROVED)
        (db.insert as any).mockReturnValue(mockQueryBuilder([{ id: 10, ...newConge, statut: 'APPROVED' }]));

        const res = await request(app).post('/api/hr/conges').send(newConge);

        expect(res.status).toBe(201);
        // Response wrapped in successResponse: { success: true, data: ... }
        expect(res.body.data.statut).toBe('APPROVED');
        expect(db.insert).toHaveBeenCalled();
    });

    it('PATCH /api/hr/conges/:id/approve should approve a leave', async () => {
        // First db.select returns the current leave (must be PENDING)
        (db.select as any).mockReturnValueOnce(mockQueryBuilder([{ id: 1, statut: 'PENDING', employeId: 'emp-1' }]));
        // db.update returns the approved leave
        (db.update as any).mockReturnValue(mockQueryBuilder([{ id: 1, statut: 'APPROVED' }]));

        const res = await request(app).patch('/api/hr/conges/1/approve').send({ commentaire: 'Ok' });

        expect(res.status).toBe(200);
        expect(res.body.data.statut).toBe('APPROVED');
    });
});
