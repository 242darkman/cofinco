/**
 * Service de scoring automatique des candidatures
 * Compare le profil d'un candidat aux exigences d'une offre d'emploi
 */

import { db } from "../db";
import { candidatures, jobOffers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("CandidatureScoringService");

// Ordinal mapping for qualification levels
const QUALIFICATION_ORDINAL: Record<string, number> = {
  OUVRIER: 1,
  EMPLOYE: 2,
  AGENT_MAITRISE: 3,
  CADRE: 4,
  CADRE_SUPERIEUR: 5,
};

// Keywords to detect qualification level from free text
const QUALIFICATION_KEYWORDS: Array<{ keywords: string[]; level: string }> = [
  { keywords: ["master", "ingenieur", "mba", "doctorat", "phd", "dess", "dea", "bac+5", "bac+6", "bac+7", "bac+8"], level: "CADRE_SUPERIEUR" },
  { keywords: ["licence", "bachelor", "bac+3", "bac+4", "maitrise", "iut"], level: "CADRE" },
  { keywords: ["bts", "dut", "bac+2", "technicien superieur", "deug"], level: "AGENT_MAITRISE" },
  { keywords: ["baccalaureat", "bac", "diplome secondaire"], level: "EMPLOYE" },
  { keywords: ["cap", "bep", "certificat", "bepc", "cepe"], level: "OUVRIER" },
];

/**
 * Normalize text for comparison: lowercase, remove accents, trim
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Score competences matching (0-100)
 * Checks how many required competences appear in candidate's text
 */
function scoreCompetences(candidateText: string, requiredCompetences: string[]): number {
  if (!requiredCompetences || requiredCompetences.length === 0) return 50; // Neutral
  if (!candidateText) return 0;

  const normalizedText = normalizeText(candidateText);
  let matches = 0;

  for (const comp of requiredCompetences) {
    const normalizedComp = normalizeText(comp);
    // Check for substring match (allows partial matches like "comptabilite" matching "comptabilite analytique")
    if (normalizedText.includes(normalizedComp)) {
      matches++;
    } else {
      // Try individual words for multi-word competences
      const words = normalizedComp.split(/\s+/);
      if (words.length > 1 && words.every(w => normalizedText.includes(w))) {
        matches++;
      }
    }
  }

  return Math.round((matches / requiredCompetences.length) * 100);
}

/**
 * Detect qualification level from free text
 */
function detectQualificationLevel(text: string): string | null {
  if (!text) return null;
  const normalizedText = normalizeText(text);

  // Check from highest to lowest qualification
  for (const entry of QUALIFICATION_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (normalizedText.includes(keyword)) {
        return entry.level;
      }
    }
  }
  return null;
}

/**
 * Score qualification matching (0-100)
 */
function scoreQualification(candidateFormation: string, requiredLevel: string | null): number {
  if (!requiredLevel) return 50; // Neutral
  
  const detectedLevel = detectQualificationLevel(candidateFormation || "");
  if (!detectedLevel) return 30; // Can't determine, slightly below neutral

  const requiredOrd = QUALIFICATION_ORDINAL[requiredLevel] || 0;
  const candidateOrd = QUALIFICATION_ORDINAL[detectedLevel] || 0;

  if (candidateOrd >= requiredOrd) return 100;
  if (candidateOrd === requiredOrd - 1) return 60;
  return 20;
}

/**
 * Extract years of experience from free text using regex
 */
function extractExperienceYears(text: string): number | null {
  if (!text) return null;
  const normalizedText = normalizeText(text);

  // Patterns: "5 ans", "5 annees", "5 years", "5ans", digits near experience keywords
  const patterns = [
    /(\d+)\s*(?:ans?|annees?|years?)/,
    /(\d+)\s*(?:an|année)\s*(?:d')?experience/,
    /experience\s*(?:de\s*)?(\d+)\s*(?:ans?|annees?)/,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Score experience matching (0-100)
 */
function scoreExperience(candidateExperience: string, requiredYears: number): number {
  if (!requiredYears || requiredYears === 0) return 50; // Neutral

  const extractedYears = extractExperienceYears(candidateExperience || "");
  if (extractedYears === null) return 30; // Can't determine

  if (extractedYears >= requiredYears) return 100;
  // Proportional score
  return Math.round((extractedYears / requiredYears) * 80); // Max 80 if under requirement
}

/**
 * Compute global score from sub-scores with configurable weights
 */
function computeGlobalScore(
  sComp: number,
  sQual: number,
  sExp: number,
  wComp: number,
  wQual: number,
  wExp: number,
  isInternal: boolean = false
): number {
  const totalWeight = wComp + wQual + wExp;
  if (totalWeight === 0) return 50;

  let score = Math.round((wComp * sComp + wQual * sQual + wExp * sExp) / totalWeight);
  
  // Internal candidate bonus
  if (isInternal) {
    score = Math.min(100, score + 5);
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score a single candidature against its linked job offer
 */
export async function scoreCandidature(candidatureId: number): Promise<{
  scoreGlobal: number;
  scoreCompetences: number;
  scoreQualification: number;
  scoreExperience: number;
} | null> {
  const [candidature] = await db.select().from(candidatures).where(eq(candidatures.id, candidatureId));
  if (!candidature || !candidature.jobOfferId) return null;

  const [offer] = await db.select().from(jobOffers).where(eq(jobOffers.id, candidature.jobOfferId));
  if (!offer) return null;

  const candidateText = [candidature.experience, candidature.formation].filter(Boolean).join(" ");

  const sComp = scoreCompetences(candidateText, offer.competencesRequises || []);
  const sQual = scoreQualification(candidature.formation || "", offer.qualificationMinimum);
  const sExp = scoreExperience(candidature.experience || "", offer.experienceMinAnnees || 0);
  const isInternal = candidature.source === "INTERNAL_PORTAL";

  const sGlobal = computeGlobalScore(
    sComp, sQual, sExp,
    offer.poidsCompetences || 40,
    offer.poidsQualification || 30,
    offer.poidsExperience || 30,
    isInternal
  );

  const scores = {
    scoreGlobal: sGlobal,
    scoreCompetences: sComp,
    scoreQualification: sQual,
    scoreExperience: sExp,
  };

  // Persist scores
  await db.update(candidatures)
    .set(scores)
    .where(eq(candidatures.id, candidatureId));

  logger.info({ candidatureId, ...scores }, "Candidature scored");

  return scores;
}

/**
 * Re-score all candidatures for a given job offer
 */
export async function scoreAllCandidatures(jobOfferId: number): Promise<number> {
  const linkedCandidatures = await db.select({ id: candidatures.id })
    .from(candidatures)
    .where(eq(candidatures.jobOfferId, jobOfferId));

  let scored = 0;
  for (const c of linkedCandidatures) {
    const result = await scoreCandidature(c.id);
    if (result) scored++;
  }

  logger.info({ jobOfferId, scored, total: linkedCandidatures.length }, "Batch scoring completed");
  return scored;
}
