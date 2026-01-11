
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { hrRouter } from '../../server/routes/hr';
import { storage } from '../../server/storage';

// MOCK MIDDLEWARE
vi.mock('../../server/middleware', () => ({
  getAuthUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', role: 'agent' }; 
    next();
  },
  requireRole: (roles: any) => (req: any, res: any, next: any) => next()
}));

// MOCK DB (Required deep dependency)
vi.mock('../../server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn() }
}));

// MOCK STORAGE
vi.mock('../../server/storage', () => ({
  storage: {
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    getPresenceAujourdhui: vi.fn()
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

describe('HR Attendance Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('POST /api/hr/presence/checkin should record check-in', async () => {
        (storage.checkIn as any).mockResolvedValue({ id: 1, statut: 'Présent' });

        const res = await request(app).post('/api/hr/presence/checkin');

        expect(res.status).toBe(200);
        expect(storage.checkIn).toHaveBeenCalledWith('test-user');
        expect(res.body.statut).toBe('Présent');
    });

    it('POST /api/hr/presence/checkout should record check-out', async () => {
        (storage.checkOut as any).mockResolvedValue({ id: 1, statut: 'Présent', heureDepart: '18:00' });

        const res = await request(app).post('/api/hr/presence/checkout');

        expect(res.status).toBe(200);
        expect(storage.checkOut).toHaveBeenCalledWith('test-user');
    });

    it('GET /api/hr/presence/today should return stats', async () => {
        const mockStats = { presents: 10, absents: 2 };
        (storage.getPresenceAujourdhui as any).mockResolvedValue(mockStats);

        const res = await request(app).get('/api/hr/presence/today');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockStats);
    });
});
