import { db } from "./db";
import { clients, credits, comptes } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export async function calculateClientScore(clientId: string): Promise<{ score: number; segment: string }> {
  let score = 0;

  // 1. Fetch Data
  const client = await db.query.clients.findFirst({
      where: eq(clients.id, clientId)
  });

  if (!client) throw new Error("Client not found");

  const clientCredits = await db.query.credits.findMany({
      where: eq(credits.clientId, clientId)
  });

  const clientSavings = await db.query.comptes.findMany({
      where: eq(comptes.clientId, clientId)
  });

  // 2. Repayment History (Max 40 pts)
  let repaymentScore = 0;
  const paidCredits = clientCredits.filter(c => c.statut === 'PAID' || c.statut === 'CLOSED');
  const lateCredits = clientCredits.filter(c => c.statut === 'LATE');

  repaymentScore += (paidCredits.length * 10); // +10 per paid credit
  repaymentScore -= (lateCredits.length * 20); // -20 per late credit (heavy penalty)
  
  // Cap repayment score
  repaymentScore = Math.min(repaymentScore, 40);
  repaymentScore = Math.max(repaymentScore, 0); // No negative contribution to total, just 0
  
  score += repaymentScore;

  // 3. Savings Regularity (Max 30 pts)
  let savingsScore = 0;
  savingsScore += (clientSavings.length * 5); // +5 per account
  
  // Check recent activity (dummy logic for now as we might not have tons of transactions in seed)
  if (parseFloat(client.epargneTotal || '0') > 100000) savingsScore += 10;
  if (parseFloat(client.epargneTotal || '0') > 500000) savingsScore += 10;

  savingsScore = Math.min(savingsScore, 30);
  score += savingsScore;

  // 4. Loyalty / Tenure (Max 20 pts)
  let loyaltyScore = 0;
  const tenureMonths = (new Date().getTime() - new Date(client.createdAt || new Date()).getTime()) / (1000 * 60 * 60 * 24 * 30);
  
  if (tenureMonths > 3) loyaltyScore += 5;
  if (tenureMonths > 6) loyaltyScore += 5;
  if (tenureMonths > 12) loyaltyScore += 10;

  score += loyaltyScore;

  // 5. Profile Completeness (Max 10 pts)
  // Check for address and profession (user identity fields are in users table)
  let profileScore = 0;
  if (client.adresseDomicile && client.profession && client.numeroPiece) profileScore = 10;
  else if (client.adresseDomicile && client.profession) profileScore = 5;

  score += profileScore;

  // Final Cap
  score = Math.min(score, 100);
  score = Math.max(score, 10); // Minimum score

  // Determine Segment
  let segment = 'Standard';
  if (score >= 75) segment = 'VIP';
  else if (score < 40) segment = 'Risque';

  // Update Database
  await db.update(clients)
      .set({ 
          score, 
          segment,
          updatedAt: new Date() 
      })
      .where(eq(clients.id, clientId));

  return { score, segment };
}
