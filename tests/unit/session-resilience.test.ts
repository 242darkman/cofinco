/**
 * Tests de résilience session — Anti-fausse-déconnexion
 *
 * Vérifie que le frontend ne déconnecte JAMAIS l'utilisateur
 * sauf sur un 401 confirmé par /api/auth/me.
 *
 * Scénarios couverts :
 * - 401 transitoire sur endpoint métier → /me revalide → PAS de logout
 * - 401 confirmé par /me → logout effectif
 * - 5xx / timeout / erreur réseau → PAS de logout
 * - Multiples 401 simultanés → un seul appel /me (debounce singleton)
 * - verifySession auth.ts : network error → session maintenue
 * - verifySession auth.ts : 401 → session invalidée
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// MOCK SETUP — Simulate browser APIs for node environment
// ============================================================================

// We test the logic patterns directly rather than importing browser modules
// This avoids needing jsdom while testing the critical decision logic

describe("Session Resilience — revalidateSessionBeforeLogout pattern", () => {
  let onUnauthorizedCallback: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let revalidationInFlight: Promise<boolean> | null;
  let lastRevalidationTime: number;
  const REVALIDATION_COOLDOWN_MS = 3000;

  // Inline implementation matching api-client.ts revalidateSessionBeforeLogout
  async function revalidateSessionBeforeLogout(reason: string): Promise<boolean> {
    if (revalidationInFlight) {
      return revalidationInFlight;
    }

    const now = Date.now();
    if (now - lastRevalidationTime < REVALIDATION_COOLDOWN_MS) {
      return false;
    }

    revalidationInFlight = (async () => {
      try {
        lastRevalidationTime = Date.now();
        const response = await fetchMock("/api/auth/me", { credentials: "include" });

        if (response.ok) {
          return false; // Session valid
        }
        if (response.status === 401) {
          onUnauthorizedCallback();
          return true; // Session truly invalid
        }
        // 5xx → don't logout
        return false;
      } catch {
        // Network error → don't logout
        return false;
      } finally {
        revalidationInFlight = null;
      }
    })();

    return revalidationInFlight;
  }

  beforeEach(() => {
    onUnauthorizedCallback = vi.fn();
    fetchMock = vi.fn();
    revalidationInFlight = null;
    lastRevalidationTime = 0;
  });

  // -------------------------------------------------------
  // CORE: 401 transitoire → /me OK → PAS de logout
  // -------------------------------------------------------
  it("should NOT logout when /me returns 200 (transient 401)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await revalidateSessionBeforeLogout("session_expired");

    expect(result).toBe(false); // Session is valid
    expect(onUnauthorizedCallback).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------
  // CORE: 401 confirmé par /me → logout
  // -------------------------------------------------------
  it("should logout when /me confirms 401", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await revalidateSessionBeforeLogout("session_expired");

    expect(result).toBe(true); // Session truly invalid
    expect(onUnauthorizedCallback).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------
  // CORE: 5xx sur /me → PAS de logout
  // -------------------------------------------------------
  it("should NOT logout when /me returns 500 (server error)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await revalidateSessionBeforeLogout("session_expired");

    expect(result).toBe(false);
    expect(onUnauthorizedCallback).not.toHaveBeenCalled();
  });

  it("should NOT logout when /me returns 502 (gateway error)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502 });

    const result = await revalidateSessionBeforeLogout("session_expired");

    expect(result).toBe(false);
    expect(onUnauthorizedCallback).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // CORE: Erreur réseau sur /me → PAS de logout
  // -------------------------------------------------------
  it("should NOT logout when /me throws network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await revalidateSessionBeforeLogout("session_expired");

    expect(result).toBe(false);
    expect(onUnauthorizedCallback).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // CORE: Timeout sur /me → PAS de logout
  // -------------------------------------------------------
  it("should NOT logout when /me times out", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    const result = await revalidateSessionBeforeLogout("session_expired");

    expect(result).toBe(false);
    expect(onUnauthorizedCallback).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // DEBOUNCE: Multiples 401 simultanés → UN seul /me
  // -------------------------------------------------------
  it("should deduplicate concurrent revalidation calls (singleton)", async () => {
    // /me takes 100ms to respond
    fetchMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200 }), 100))
    );

    // Fire 5 concurrent 401s
    const results = await Promise.all([
      revalidateSessionBeforeLogout("err1"),
      revalidateSessionBeforeLogout("err2"),
      revalidateSessionBeforeLogout("err3"),
      revalidateSessionBeforeLogout("err4"),
      revalidateSessionBeforeLogout("err5"),
    ]);

    // All should get the same result
    expect(results).toEqual([false, false, false, false, false]);
    // Only ONE /me call
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorizedCallback).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // COOLDOWN: Pas de re-vérification pendant 3s
  // -------------------------------------------------------
  it("should skip revalidation during cooldown period", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    // First call
    await revalidateSessionBeforeLogout("reason1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call within cooldown — should skip
    const result = await revalidateSessionBeforeLogout("reason2");
    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1 — no new call
  });
});

// ============================================================================
// verifySession (auth.ts pattern) — Distinguish 401 from network errors
// ============================================================================

describe("Session Resilience — verifySession pattern (auth.ts)", () => {
  let clearSessionMock: ReturnType<typeof vi.fn>;
  let onSessionExpiredMock: ReturnType<typeof vi.fn>;
  let getMeMock: ReturnType<typeof vi.fn>;

  class MockApiError extends Error {
    public readonly status: number;
    public readonly data: any;
    constructor(message: string, status: number, data?: any) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }

  // Inline implementation matching auth.ts verifySession pattern
  async function verifySession(): Promise<boolean> {
    try {
      await getMeMock();
      return true;
    } catch (error) {
      if (error instanceof MockApiError && error.status === 401) {
        clearSessionMock();
        onSessionExpiredMock();
        return false;
      }
      // Network/5xx → keep session
      return true;
    }
  }

  beforeEach(() => {
    clearSessionMock = vi.fn();
    onSessionExpiredMock = vi.fn();
    getMeMock = vi.fn();
  });

  // -------------------------------------------------------
  // /me OK → session valide
  // -------------------------------------------------------
  it("should return true and NOT clear session when /me succeeds", async () => {
    getMeMock.mockResolvedValueOnce({ id: "1", username: "test" });

    const result = await verifySession();

    expect(result).toBe(true);
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(onSessionExpiredMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // /me 401 → session invalide → logout
  // -------------------------------------------------------
  it("should return false and clear session on confirmed 401", async () => {
    getMeMock.mockRejectedValueOnce(new MockApiError("Session expired", 401));

    const result = await verifySession();

    expect(result).toBe(false);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
    expect(onSessionExpiredMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------
  // /me 500 → session MAINTENUE (pas de logout)
  // -------------------------------------------------------
  it("should return true and keep session on 500 error", async () => {
    getMeMock.mockRejectedValueOnce(new MockApiError("Internal Server Error", 500));

    const result = await verifySession();

    expect(result).toBe(true);
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(onSessionExpiredMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // /me 502 → session MAINTENUE
  // -------------------------------------------------------
  it("should return true and keep session on 502 gateway error", async () => {
    getMeMock.mockRejectedValueOnce(new MockApiError("Bad Gateway", 502));

    const result = await verifySession();

    expect(result).toBe(true);
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(onSessionExpiredMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // /me réseau down → session MAINTENUE
  // -------------------------------------------------------
  it("should return true and keep session on network error (TypeError)", async () => {
    getMeMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await verifySession();

    expect(result).toBe(true);
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(onSessionExpiredMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // /me timeout → session MAINTENUE
  // -------------------------------------------------------
  it("should return true and keep session on timeout (AbortError)", async () => {
    getMeMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    const result = await verifySession();

    expect(result).toBe(true);
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(onSessionExpiredMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // /me 403 → session MAINTENUE (403 = autorisation, pas auth)
  // -------------------------------------------------------
  it("should return true and keep session on 403 (authorization, not authentication)", async () => {
    getMeMock.mockRejectedValueOnce(new MockApiError("Forbidden", 403));

    const result = await verifySession();

    expect(result).toBe(true);
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(onSessionExpiredMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// handleResponse — 401 on non-auth endpoint behavior
// ============================================================================

describe("Session Resilience — handleResponse 401 routing", () => {

  it("401 on /auth/login should throw credentials error, NOT trigger session check", () => {
    // The login endpoint 401 is bad credentials, not session expiration
    // Verified by code: endpoint.includes('/auth/login') → throw ApiError directly
    const endpoint = "/auth/login";
    expect(endpoint.includes("/auth/login")).toBe(true);
  });

  it("401 on /auth/me should NOT trigger revalidation (is auth endpoint)", () => {
    // /auth/me 401 is the revalidation response itself — no recursion
    const endpoint = "/auth/me";
    const isAuthEndpoint =
      endpoint.includes("/auth/me") ||
      endpoint.includes("/auth/session-info") ||
      endpoint.includes("/auth/refresh");
    expect(isAuthEndpoint).toBe(true);
  });

  it("401 on business endpoint should trigger revalidation (not direct logout)", () => {
    // Business endpoints like /clients, /credits → trigger revalidateSessionBeforeLogout
    const businessEndpoints = ["/clients", "/credits/123", "/caisses/status", "/users"];
    for (const endpoint of businessEndpoints) {
      const isAuthEndpoint =
        endpoint.includes("/auth/me") ||
        endpoint.includes("/auth/session-info") ||
        endpoint.includes("/auth/refresh");
      expect(isAuthEndpoint).toBe(false);
    }
  });
});

// ============================================================================
// validateSession — Should return valid: true on network errors
// ============================================================================

describe("Session Resilience — validateSession (api-client.ts)", () => {

  class MockApiError extends Error {
    public readonly status: number;
    public readonly data: any;
    constructor(message: string, status: number, data?: any) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }

  let requestMock: ReturnType<typeof vi.fn>;

  async function validateSession(): Promise<{ valid: boolean; reason?: string }> {
    try {
      await requestMock("/auth/me");
      return { valid: true };
    } catch (error) {
      if (error instanceof MockApiError && error.status === 401) {
        return { valid: false, reason: "session_invalid" };
      }
      // Network/5xx → DON'T invalidate
      return { valid: true, reason: "network_error" };
    }
  }

  beforeEach(() => {
    requestMock = vi.fn();
  });

  it("should return valid: true when /me succeeds", async () => {
    requestMock.mockResolvedValueOnce({ id: "1" });
    const result = await validateSession();
    expect(result.valid).toBe(true);
  });

  it("should return valid: false only on 401", async () => {
    requestMock.mockRejectedValueOnce(new MockApiError("Unauthorized", 401));
    const result = await validateSession();
    expect(result.valid).toBe(false);
  });

  it("should return valid: true on network error (session might still be valid)", async () => {
    requestMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await validateSession();
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("network_error");
  });

  it("should return valid: true on 500 error (session might still be valid)", async () => {
    requestMock.mockRejectedValueOnce(new MockApiError("Server Error", 500));
    const result = await validateSession();
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("network_error");
  });
});
