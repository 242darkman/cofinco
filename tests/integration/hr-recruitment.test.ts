
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { hrRouter } from '../../server/routes/hr';
import { db } from '../../server/db';
import { candidatures } from '../../shared/schema';

// MOCK MIDDLEWARE
vi.mock('../../server/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'rh' }; 
    next();
  },
  requireRole: (roles: any) => (req: any, res: any, next: any) => next()
}));

// MOCK DB
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}));

// MOCK WS SERVER
vi.mock('../../server/ws-server', () => ({
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
    then: (resolve: any) => resolve(result),
  };
};

describe('HR Recruitment Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        (db.update as any).mockReturnValue(mockQueryBuilder([{ id: 1, statut: 'Entretien' }]));

        const res = await request(app).patch('/api/hr/candidatures/1').send({ statut: 'Entretien' });

        expect(res.status).toBe(200);
        expect(res.body.statut).toBe('Entretien');
    });
});
