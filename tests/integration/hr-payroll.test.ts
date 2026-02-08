
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { hrRouter } from 'server/routes/hr';
import { db } from 'server/db';
import { storage } from 'server/storage';

// MOCK MIDDLEWARE
vi.mock('server/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'admin' }; // Role admin required for payroll gen
    next();
  },
  requireRole: (roles: any) => (req: any, res: any, next: any) => next()
}));

// MOCK DB (Minimal mock as we mock storage mostly for extensive logic)
vi.mock('server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}));

// MOCK STORAGE (Complex payroll logic is in storage, so we mock it to test route wiring)
vi.mock('server/storage', () => ({
  storage: {
    generateMonthlyPaie: vi.fn(),
    getBulletins: vi.fn(),
    getHrStats: vi.fn()
  }
}));

// MOCK WS SERVER
vi.mock('server/ws-server', () => ({
  getWsInstance: () => ({
    broadcast: vi.fn()
  })
}));

const app = express();
app.use(express.json());
app.use('/api/hr', hrRouter);

// Helper for DB chaining (for simple routes not using storage)
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
(db.select as any).mockImplementation(() => mockQueryBuilder([]));

describe('HR Payroll Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('POST /api/hr/paie/generate should trigger payroll generation', async () => {
        (storage.generateMonthlyPaie as any).mockResolvedValue([{ id: 1, salaireNet: 1000 }]);
        
        const res = await request(app).post('/api/hr/paie/generate').send({ mois: '2026-01' });
        
        expect(res.status).toBe(201);
        expect(storage.generateMonthlyPaie).toHaveBeenCalledWith('2026-01', 'test-user');
        expect(res.body.data).toHaveLength(1);
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

        (db.select as any).mockReturnValue(mockQueryBuilder([])); // Ensure no existing bulletin
        (db.insert as any).mockReturnValue(mockQueryBuilder([{ id: 2, ...manualBulletin }]));

        const res = await request(app).post('/api/hr/bulletins').send(manualBulletin);

        expect(res.status).toBe(201);
        expect(db.insert).toHaveBeenCalled();
    });
});
