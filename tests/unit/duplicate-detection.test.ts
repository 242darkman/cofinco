import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Unit tests for duplicate detection middleware.
// We mock the database to test the middleware logic in isolation.
// ============================================================================

// Mock the database module before importing the middleware
vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock the schema modules (just the table references)
vi.mock("@shared/schema", () => ({
  operationsCaisse: {},
  transactionsCompte: {},
  mouvementsFinanciers: {
    compteId: "compteId",
    montant: "montant",
    statut: "statut",
    createdAt: "createdAt",
    createdBy: "createdBy",
    id: "id",
    reference: "reference",
    sens: "sens",
  },
}));

import { duplicateDetection } from "../../server/middleware/duplicate-detection";
import { db } from "../../server/db";
import type { Request, Response, NextFunction } from "express";

// Helper to create mock request/response/next
function createMocks(body: Record<string, any> = {}, params: Record<string, any> = {}, session: any = {}) {
  const req = {
    body,
    params,
    session,
  } as unknown as Request;

  const resBody: { statusCode?: number; data?: any } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn((data) => {
      resBody.data = data;
      return res;
    }),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next, resBody };
}

describe("duplicateDetection middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call next() when skipDuplicateCheck is true", async () => {
    const middleware = duplicateDetection();
    const { req, res, next } = createMocks({ skipDuplicateCheck: true, montant: 50000 });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when montant is missing", async () => {
    const middleware = duplicateDetection();
    const { req, res, next } = createMocks({ compteId: "abc-123" });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when compteId is missing", async () => {
    const middleware = duplicateDetection();
    const { req, res, next } = createMocks({ montant: 50000 });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next() when no duplicates found", async () => {
    // Setup DB mock chain
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db.select as any) = mockSelect;

    const middleware = duplicateDetection();
    const { req, res, next } = createMocks(
      { montant: 50000 },
      { id: "compte-123" },
      { user: { id: "user-1" } }
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 409 with canOverride when duplicates found in non-strict mode", async () => {
    const duplicates = [
      { id: "mvt-1", montant: "50000", reference: "REF-001", createdAt: new Date(), sens: "CREDIT" },
    ];
    const mockLimit = vi.fn().mockResolvedValue(duplicates);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db.select as any) = mockSelect;

    const middleware = duplicateDetection({ strict: false });
    const { req, res, next } = createMocks(
      { montant: 50000 },
      { id: "compte-123" },
      { user: { id: "user-1" } }
    );

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "POTENTIAL_DUPLICATE",
        canOverride: true,
        duplicates: expect.arrayContaining([
          expect.objectContaining({ id: "mvt-1", reference: "REF-001" }),
        ]),
      })
    );
  });

  it("should return 409 without canOverride in strict mode", async () => {
    const duplicates = [
      { id: "mvt-2", montant: "100000", reference: "REF-002", createdAt: new Date(), sens: "DEBIT" },
    ];
    const mockLimit = vi.fn().mockResolvedValue(duplicates);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db.select as any) = mockSelect;

    const middleware = duplicateDetection({ strict: true });
    const { req, res, next } = createMocks(
      { montant: 100000 },
      { id: "compte-456" },
      { user: { id: "user-2" } }
    );

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "POTENTIAL_DUPLICATE",
        canOverride: false,
      })
    );
  });

  it("should use custom windowSeconds", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db.select as any) = mockSelect;

    const middleware = duplicateDetection({ windowSeconds: 60 });
    const { req, res, next } = createMocks(
      { montant: 25000 },
      { id: "compte-789" },
      { user: { id: "user-3" } }
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    // The windowSeconds is used internally - we verify it doesn't break
  });

  it("should use compteId from params.id when body.compteId is absent", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db.select as any) = mockSelect;

    const middleware = duplicateDetection();
    const { req, res, next } = createMocks(
      { montant: 50000 },
      { id: "from-params" },
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should gracefully handle DB errors and call next()", async () => {
    (db.select as any) = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        }),
      }),
    });

    const middleware = duplicateDetection();
    const { req, res, next } = createMocks(
      { montant: 50000 },
      { id: "compte-err" },
      { user: { id: "user-x" } }
    );

    // Should not throw - errors are caught and next() is called
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should default windowSeconds to 300 (5 minutes)", async () => {
    const duplicates = [
      { id: "mvt-3", montant: "50000", reference: "REF-003", createdAt: new Date(), sens: "CREDIT" },
    ];
    const mockLimit = vi.fn().mockResolvedValue(duplicates);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db.select as any) = mockSelect;

    const middleware = duplicateDetection();
    const { req, res, next } = createMocks(
      { montant: 50000 },
      { id: "compte-def" },
    );

    await middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        windowSeconds: 300,
      })
    );
  });
});
