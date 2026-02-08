
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { hrRouter } from 'server/routes/hr';
import { db } from 'server/db';
import { demandesConges } from '@shared/schema';

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

// MOCK WS SERVER
vi.mock('server/ws-server', () => ({
  getWsInstance: () => ({
    broadcast: vi.fn()
  })
}));

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
    then: (resolve: any) => resolve(result), // support await
  };
};
(db.select as any).mockImplementation(() => mockQueryBuilder([]));
(db.insert as any).mockImplementation(() => mockQueryBuilder([]));
(db.update as any).mockImplementation(() => mockQueryBuilder([]));

describe('HR Leaves Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET /api/hr/conges should return list of leaves', async () => {
        const mockLeaves = [{ id: 1, type: 'Congé Annuel', statut: 'En attente' }];
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
        
        (db.insert as any).mockReturnValue(mockQueryBuilder([{ id: 10, ...newConge, statut: 'Approuvé' }])); // Auto-approved because mock user is admin

        const res = await request(app).post('/api/hr/conges').send(newConge);
        
        expect(res.status).toBe(201);
        expect(res.body.statut).toBe('Approuvé');
        expect(db.insert).toHaveBeenCalled();
    });

    it('PATCH /api/hr/conges/:id/approve should approve a leave', async () => {
        (db.update as any).mockReturnValue(mockQueryBuilder([{ id: 1, statut: 'Approuvé' }]));
        
        const res = await request(app).patch('/api/hr/conges/1/approve').send({ commentaire: 'Ok' });
        
        expect(res.status).toBe(200);
        expect(res.body.statut).toBe('Approuvé');
    });
});
