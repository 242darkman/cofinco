import { db } from "../../db";
import { eq } from "drizzle-orm";
import { tontines, clients } from "@shared/schema";

const KYC_LEVEL_ORDER: Record<string, number> = { NONE: 0, BASIC: 1, FULL: 2 };

export async function validateMemberKycAndSegment(tontineId: string, clientId: string): Promise<void> {
  const [tontine] = await db
    .select({ minKycLevel: tontines.minKycLevel, minSegmentRequired: tontines.minSegmentRequired })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  if (!tontine) return; // tontine validation happens elsewhere

  // Check KYC level
  if (tontine.minKycLevel && tontine.minKycLevel !== 'NONE') {
    const [client] = await db
      .select({ kycStatus: clients.kycStatus })
      .from(clients)
      .where(eq(clients.id, clientId));

    if (!client) throw new Error("Client introuvable");

    // Map kycStatus to a level: VERIFIED = FULL, PARTIAL = BASIC, else NONE
    const statusToLevel: Record<string, string> = {
      VERIFIED: 'FULL',
      PARTIAL: 'BASIC',
      PENDING: 'NONE',
      REJECTED: 'NONE',
      EXPIRED: 'NONE',
    };
    const clientLevel = statusToLevel[client.kycStatus] || 'NONE';
    const requiredLevel = KYC_LEVEL_ORDER[tontine.minKycLevel] ?? 0;
    const actualLevel = KYC_LEVEL_ORDER[clientLevel] ?? 0;

    if (actualLevel < requiredLevel) {
      throw new Error(
        `Niveau KYC insuffisant. Requis: ${tontine.minKycLevel}, actuel: ${clientLevel} (statut: ${client.kycStatus})`
      );
    }
  }

  // Check segment
  if (tontine.minSegmentRequired) {
    const [client] = await db
      .select({ segment: clients.segment })
      .from(clients)
      .where(eq(clients.id, clientId));

    if (!client) throw new Error("Client introuvable");

    if (client.segment !== tontine.minSegmentRequired) {
      throw new Error(
        `Segment requis: "${tontine.minSegmentRequired}", segment du client: "${client.segment}"`
      );
    }
  }
}
