import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { coffreRouter } from 'server/routes/coffre';
import { db } from 'server/db'; // Correct top-level import

// Mock dependencies
vi.mock('server/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@shared/schema', () => ({
  configCoffreFort: {
    id: 'id',
    agenceId: 'agenceId',
  },
  transfertsCoffreCaisse: {},
  transfertsCoffreAuditLogs: {},
}));

vi.mock('server/services/coffre/transfert-service', () => {
  return {
    TransfertCoffreService: class {
      listTransferts = vi.fn();
    }
  };
});

describe('Coffre Configuration API', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Mock user middleware
    app.use((req, res, next) => {
      (req as any).user = { id: 'admin-id', role: 'Administrateur', agenceId: 'agence-1' };
      next();
    });
    app.use('/api/coffre', coffreRouter);
    vi.clearAllMocks();
  });

  describe('GET /api/coffre/config', () => {
    it('should return default config if not found', async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Empty array = no config found
        }),
      });

      const res = await request(app).get('/api/coffre/config?agenceId=agence-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        seuilDoubleValidation: "1000000",
        separationInitiateurValideur: true,
        actif: true
      });
    });

    it('should return existing config', async () => {
      const mockConfig = {
        id: 1,
        agenceId: 'agence-1',
        seuilDoubleValidation: "500000",
        separationInitiateurValideur: false,
        actif: true
      };

      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockConfig]),
        }),
      });

      const res = await request(app).get('/api/coffre/config?agenceId=agence-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockConfig);
    });
  });

  describe('PUT /api/coffre/config', () => {
    it('should update existing config', async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 1 }]), // Exists
        }),
      });

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1, seuilDoubleValidation: "2000000" }]),
          }),
        }),
      });

      const res = await request(app).put('/api/coffre/config').send({
        agenceId: 'agence-1',
        seuilDoubleValidation: "2000000"
      });

      expect(res.status).toBe(200);
      expect(res.body.seuilDoubleValidation).toBe("2000000");
    });

    it('should create new config if it does not exist', async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Does not exist
        }),
      });

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 2, seuilDoubleValidation: "2000000" }]),
        }),
      });

      const res = await request(app).put('/api/coffre/config').send({
        agenceId: 'agence-1',
        seuilDoubleValidation: "2000000"
      });

      expect(res.status).toBe(200);
      expect(res.body.seuilDoubleValidation).toBe("2000000");
    });
    
    it('should reject non-admin users', async () => {
      const appUser = express();
      appUser.use(express.json());
      appUser.use((req, res, next) => {
        (req as any).user = { id: 'user-id', role: 'Caissier', agenceId: 'agence-1' };
        next();
      });
      appUser.use('/api/coffre', coffreRouter);

      const res = await request(appUser).put('/api/coffre/config').send({
        agenceId: 'agence-1',
        seuilDoubleValidation: "2000000"
      });

      expect(res.status).toBe(403);
    });
  });
});
