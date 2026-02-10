/**
 * Service de Scoring Microfinance
 *
 * Calcul automatique du score de crédit adapté au contexte de la microfinance africaine.
 * Prend en compte les spécificités locales : tontines, épargne régulière, activité informelle.
 */

import { db } from "../db";
import {
  clients,
  credits,
  comptes,
  remboursements,
  mouvementsFinanciers,
  demandesCredit
} from "@shared/schema";
import { membresTontine, contributionsTontine, tontinePenalites } from "@shared/schema/tontines";
import { eq, and, gte, lte, desc, sql, count, sum, avg, or } from "drizzle-orm";
import {
  StatutCompte,
  StatutCredit,
  StatutParticipationTontine,
  StatutTransaction,
  SegmentClient,
} from "@shared/enum/status-constants";

// ============================================================================
// TYPES
// ============================================================================

export interface ScoringFactors {
  clientId: string;
  montantDemande: number;
  dureeMois: number;
  revenuMensuel?: number;
  chargesMensuelles?: number;
}

export interface ScoreDetail {
  categorie: string;
  score: number;
  maxScore: number;
  description: string;
  indicateurs: Record<string, any>;
}

export interface ScoringResult {
  score: number;                    // Score global 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  recommendation: 'APPROUVER' | 'ETUDE_APPROFONDIE' | 'REJETER';
  tauxEndettement: number;
  capaciteRemboursement: number;
  montantMaxRecommande: number;
  details: ScoreDetail[];
  alertes: string[];
  atouts: string[];
}

// ============================================================================
// CONSTANTES DE PONDÉRATION
// ============================================================================

const POIDS = {
  HISTORIQUE_CREDIT: 30,      // Historique de remboursement
  COMPORTEMENT_EPARGNE: 25,   // Régularité et volume d'épargne
  PARTICIPATION_TONTINE: 15,  // Engagement communautaire
  CAPACITE_FINANCIERE: 20,    // Capacité de remboursement
  ANCIENNETE_RELATION: 10,    // Fidélité client
};

// Seuils de décision
const SEUILS = {
  APPROUVER: 70,
  ETUDE: 45,
  TAUX_ENDETTEMENT_MAX: 50,       // 50% max
  TAUX_ENDETTEMENT_IDEAL: 33,     // 33% idéal
};

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export async function calculerScoreMicrofinance(factors: ScoringFactors): Promise<ScoringResult> {
  const { clientId, montantDemande, dureeMois, revenuMensuel, chargesMensuelles } = factors;

  // Récupérer toutes les données du client en parallèle
  const [
    client,
    historiqueCredits,
    comptesClient,
    mouvements,
    participationsTontine,
    penalitesTontine
  ] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, clientId) }),
    getHistoriqueCredits(clientId),
    getComptesClient(clientId),
    getMouvementsClient(clientId),
    getParticipationsTontine(clientId),
    getPenalitesTontine(clientId)
  ]);

  if (!client) {
    throw new Error("Client non trouvé");
  }

  const details: ScoreDetail[] = [];
  const alertes: string[] = [];
  const atouts: string[] = [];

  // ============================================================================
  // 1. HISTORIQUE DE CRÉDIT (30 points)
  // ============================================================================
  const scoreHistorique = calculerScoreHistoriqueCredit(historiqueCredits, alertes, atouts);
  details.push(scoreHistorique);

  // ============================================================================
  // 2. COMPORTEMENT D'ÉPARGNE (25 points)
  // ============================================================================
  const scoreEpargne = calculerScoreEpargne(comptesClient, mouvements, alertes, atouts);
  details.push(scoreEpargne);

  // ============================================================================
  // 3. PARTICIPATION TONTINE (15 points)
  // ============================================================================
  const scoreTontine = calculerScoreTontine(participationsTontine, penalitesTontine, alertes, atouts);
  details.push(scoreTontine);

  // ============================================================================
  // 4. CAPACITÉ FINANCIÈRE (20 points)
  // ============================================================================
  const revenu = revenuMensuel || parseFloat(client.revenuMensuel || '0');
  // Les charges ne sont pas stockées sur le client, utiliser la valeur passée ou 0
  const charges = chargesMensuelles || 0;
  const scoreCapacite = calculerScoreCapacite(
    revenu,
    charges,
    montantDemande,
    dureeMois,
    alertes,
    atouts
  );
  details.push(scoreCapacite);

  // ============================================================================
  // 5. ANCIENNETÉ RELATION (10 points)
  // ============================================================================
  const scoreAnciennete = calculerScoreAnciennete(client, comptesClient, alertes, atouts);
  details.push(scoreAnciennete);

  // ============================================================================
  // CALCUL DU SCORE GLOBAL
  // ============================================================================
  const scoreTotal = details.reduce((acc, d) => acc + d.score, 0);
  const scoreNormalise = Math.min(100, Math.max(0, scoreTotal));

  // Grade et recommandation
  let grade: ScoringResult['grade'];
  let recommendation: ScoringResult['recommendation'];

  if (scoreNormalise >= 80) {
    grade = 'A';
    recommendation = 'APPROUVER';
  } else if (scoreNormalise >= 70) {
    grade = 'B';
    recommendation = 'APPROUVER';
  } else if (scoreNormalise >= 55) {
    grade = 'C';
    recommendation = 'ETUDE_APPROFONDIE';
  } else if (scoreNormalise >= 45) {
    grade = 'D';
    recommendation = 'ETUDE_APPROFONDIE';
  } else {
    grade = 'E';
    recommendation = 'REJETER';
  }

  // Calculs financiers
  const revenuNet = revenu - charges;
  const echeanceMensuelle = montantDemande / dureeMois;
  const tauxEndettement = revenuNet > 0 ? (echeanceMensuelle / revenuNet) * 100 : 100;

  // Montant max recommandé (basé sur 33% d'endettement)
  const capaciteRemboursementMensuelle = revenuNet * 0.33;
  const montantMaxRecommande = Math.max(0, capaciteRemboursementMensuelle * dureeMois);

  // Vérification du taux d'endettement
  if (tauxEndettement > SEUILS.TAUX_ENDETTEMENT_MAX) {
    alertes.push(`Taux d'endettement élevé: ${tauxEndettement.toFixed(1)}% (max recommandé: ${SEUILS.TAUX_ENDETTEMENT_MAX}%)`);
    if (recommendation === 'APPROUVER') {
      recommendation = 'ETUDE_APPROFONDIE';
    }
  }

  return {
    score: scoreNormalise,
    grade,
    recommendation,
    tauxEndettement: Math.round(tauxEndettement),
    capaciteRemboursement: revenuNet,
    montantMaxRecommande: Math.round(montantMaxRecommande),
    details,
    alertes,
    atouts
  };
}

// ============================================================================
// CALCUL HISTORIQUE CRÉDIT
// ============================================================================

interface HistoriqueCredit {
  credits: any[];
  remboursements: any[];
  stats: {
    totalCredits: number;
    creditsSoldes: number;
    creditsEnRetard: number;
    creditsActifs: number;
    tauxRemboursement: number;
    joursRetardMoyen: number;
  };
}

async function getHistoriqueCredits(clientId: string): Promise<HistoriqueCredit> {
  const creditsClient = await db.query.credits.findMany({
    where: eq(credits.clientId, clientId)
  });

  // Récupérer tous les remboursements des crédits du client
  const creditIds = creditsClient.map(c => c.id);
  let remboursementsClient: any[] = [];

  if (creditIds.length > 0) {
    remboursementsClient = await db.query.remboursements.findMany({
      where: sql`${remboursements.creditId} IN (${sql.join(creditIds.map(id => sql`${id}`), sql`, `)})`
    });
  }

  const creditsSoldes = creditsClient.filter(c => (c.statut === StatutCredit.PAID || c.statut === StatutCredit.CLOSED)).length;
  const creditsEnRetard = creditsClient.filter(c => (c.statut === StatutCredit.LATE)).length;
  const creditsActifs = creditsClient.filter(c => (c.statut === StatutCredit.ACTIVE)).length;

  // Calculer le taux de remboursement
  const remboursementsPayes = remboursementsClient.filter(r =>
    r.statut === StatutTransaction.POSTED
  ).length;
  const totalRemboursements = remboursementsClient.length;
  const tauxRemboursement = totalRemboursements > 0 ? (remboursementsPayes / totalRemboursements) * 100 : 100;

  // Calculer les jours de retard moyens
  const remboursementsEnRetard = remboursementsClient.filter(r => r.joursRetard && r.joursRetard > 0);
  const joursRetardMoyen = remboursementsEnRetard.length > 0
    ? remboursementsEnRetard.reduce((acc, r) => acc + (r.joursRetard || 0), 0) / remboursementsEnRetard.length
    : 0;

  return {
    credits: creditsClient,
    remboursements: remboursementsClient,
    stats: {
      totalCredits: creditsClient.length,
      creditsSoldes,
      creditsEnRetard,
      creditsActifs,
      tauxRemboursement,
      joursRetardMoyen
    }
  };
}

function calculerScoreHistoriqueCredit(
  historique: HistoriqueCredit,
  alertes: string[],
  atouts: string[]
): ScoreDetail {
  const maxScore = POIDS.HISTORIQUE_CREDIT;
  let score = 0;
  const { stats } = historique;

  if (stats.totalCredits === 0) {
    // Nouveau client sans historique - score neutre
    score = maxScore * 0.5; // 50% du max
    return {
      categorie: "Historique Crédit",
      score: Math.round(score),
      maxScore,
      description: "Premier crédit - pas d'historique",
      indicateurs: { ...stats, nouveauClient: true }
    };
  }

  // Points pour crédits soldés avec succès (+5 pts chacun, max 15)
  const pointsSoldes = Math.min(15, stats.creditsSoldes * 5);
  score += pointsSoldes;

  if (stats.creditsSoldes >= 2) {
    atouts.push(`${stats.creditsSoldes} crédits soldés avec succès`);
  }

  // Pénalité pour crédits en retard (-10 pts chacun)
  const penaliteRetard = stats.creditsEnRetard * 10;
  score -= penaliteRetard;

  if (stats.creditsEnRetard > 0) {
    alertes.push(`${stats.creditsEnRetard} crédit(s) actuellement en retard`);
  }

  // Bonus pour taux de remboursement élevé
  if (stats.tauxRemboursement >= 95) {
    score += 10;
    atouts.push(`Excellent taux de remboursement: ${stats.tauxRemboursement.toFixed(0)}%`);
  } else if (stats.tauxRemboursement >= 80) {
    score += 5;
  } else if (stats.tauxRemboursement < 70) {
    score -= 5;
    alertes.push(`Taux de remboursement faible: ${stats.tauxRemboursement.toFixed(0)}%`);
  }

  // Pénalité pour retards fréquents
  if (stats.joursRetardMoyen > 15) {
    score -= 5;
    alertes.push(`Retards fréquents: moyenne de ${stats.joursRetardMoyen.toFixed(0)} jours`);
  } else if (stats.joursRetardMoyen <= 3 && stats.totalCredits > 0) {
    score += 5;
    atouts.push("Paiements toujours à temps");
  }

  // Normaliser entre 0 et maxScore
  score = Math.min(maxScore, Math.max(0, score));

  return {
    categorie: "Historique Crédit",
    score: Math.round(score),
    maxScore,
    description: `${stats.creditsSoldes}/${stats.totalCredits} crédits soldés`,
    indicateurs: stats
  };
}

// ============================================================================
// CALCUL COMPORTEMENT ÉPARGNE
// ============================================================================

async function getComptesClient(clientId: string) {
  return db.query.comptes.findMany({
    where: and(
      eq(comptes.clientId, clientId),
      eq(comptes.statut, StatutCompte.ACTIVE)
    )
  });
}

async function getMouvementsClient(clientId: string) {
  // Récupérer les mouvements des 6 derniers mois
  const sixMoisAgo = new Date();
  sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 6);

  return db.query.mouvementsFinanciers.findMany({
    where: and(
      eq(mouvementsFinanciers.clientId, clientId),
      gte(mouvementsFinanciers.createdAt, sixMoisAgo)
    ),
    orderBy: desc(mouvementsFinanciers.createdAt)
  });
}

function calculerScoreEpargne(
  comptesClient: any[],
  mouvements: any[],
  alertes: string[],
  atouts: string[]
): ScoreDetail {
  const maxScore = POIDS.COMPORTEMENT_EPARGNE;
  let score = 0;

  // Calculer le solde total
  const soldeTotal = comptesClient.reduce((acc, c) => {
    return acc + parseFloat(c.soldeCourant || '0');
  }, 0);

  // Points pour avoir des comptes actifs
  if (comptesClient.length > 0) {
    score += 5;
  }

  // Points selon le solde total
  if (soldeTotal >= 500000) {
    score += 8;
    atouts.push(`Épargne solide: ${soldeTotal.toLocaleString()} FCFA`);
  } else if (soldeTotal >= 200000) {
    score += 5;
  } else if (soldeTotal >= 50000) {
    score += 3;
  }

  // Analyser la régularité des dépôts
  const depots = mouvements.filter(m => (m.sens === 'CREDIT' || m.sens === 'Crédit') && m.typeOperation?.includes('Dépôt'));

  if (depots.length >= 12) {
    // Au moins 2 dépôts par mois sur 6 mois
    score += 8;
    atouts.push("Dépôts très réguliers");
  } else if (depots.length >= 6) {
    // Au moins 1 dépôt par mois
    score += 5;
    atouts.push("Dépôts réguliers");
  } else if (depots.length >= 3) {
    score += 2;
  } else if (depots.length === 0 && comptesClient.length > 0) {
    alertes.push("Aucun dépôt récent sur les comptes");
  }

  // Analyser la tendance (croissance vs décroissance)
  if (depots.length >= 4) {
    const recentDepots = depots.slice(0, Math.floor(depots.length / 2));
    const ancienDepots = depots.slice(Math.floor(depots.length / 2));

    const moyenneRecente = recentDepots.reduce((a, d) => a + parseFloat(d.montant || '0'), 0) / recentDepots.length;
    const moyenneAncienne = ancienDepots.reduce((a, d) => a + parseFloat(d.montant || '0'), 0) / ancienDepots.length;

    if (moyenneRecente > moyenneAncienne * 1.1) {
      score += 4;
      atouts.push("Épargne en croissance");
    } else if (moyenneRecente < moyenneAncienne * 0.7) {
      alertes.push("Épargne en baisse");
    }
  }

  // Normaliser
  score = Math.min(maxScore, Math.max(0, score));

  return {
    categorie: "Comportement Épargne",
    score: Math.round(score),
    maxScore,
    description: `${comptesClient.length} compte(s), ${depots.length} dépôts/6 mois`,
    indicateurs: {
      nombreComptes: comptesClient.length,
      soldeTotal,
      nombreDepots6Mois: depots.length
    }
  };
}

// ============================================================================
// CALCUL PARTICIPATION TONTINE
// ============================================================================

async function getParticipationsTontine(clientId: string) {
  return db.query.membresTontine.findMany({
    where: eq(membresTontine.clientId, clientId)
  });
}

async function getPenalitesTontine(clientId: string) {
  // Récupérer les pénalités du client via ses contributions
  const contributions = await db.query.contributionsTontine.findMany({
    where: eq(contributionsTontine.clientId, clientId)
  });

  // Pour l'instant, on considère les contributions en retard ou annulées
  return contributions.filter(c => (c.statutTransaction === StatutTransaction.CANCELLED));
}

function calculerScoreTontine(
  participations: any[],
  penalites: any[],
  alertes: string[],
  atouts: string[]
): ScoreDetail {
  const maxScore = POIDS.PARTICIPATION_TONTINE;
  let score = 0;

  if (participations.length === 0) {
    // Pas de participation tontine - score neutre
    return {
      categorie: "Participation Tontine",
      score: Math.round(maxScore * 0.3), // 30% du max
      maxScore,
      description: "Aucune participation aux tontines",
      indicateurs: { participations: 0, penalites: 0 }
    };
  }

  // Points pour participation active
  const participationsActives = participations.filter(p => (p.statut === StatutParticipationTontine.ACTIVE));
  score += Math.min(6, participationsActives.length * 3);

  if (participationsActives.length >= 2) {
    atouts.push(`Membre actif de ${participationsActives.length} tontines`);
  }

  // Points pour cotisations totales
  const totalCotisations = participations.reduce((acc, p) => {
    return acc + parseFloat(p.totalCotisations || '0');
  }, 0);

  if (totalCotisations >= 100000) {
    score += 5;
  } else if (totalCotisations >= 50000) {
    score += 3;
  }

  // Bonus si a déjà reçu un bénéfice (montre cycle complet)
  const aRecuBenefice = participations.some(p => p.aRecuBenefice);
  if (aRecuBenefice) {
    score += 4;
    atouts.push("A complété des cycles de tontine");
  }

  // Pénalité pour défauts
  if (penalites.length > 0) {
    score -= Math.min(8, penalites.length * 2);
    if (penalites.length >= 3) {
      alertes.push(`${penalites.length} incidents de paiement en tontine`);
    }
  }

  // Normaliser
  score = Math.min(maxScore, Math.max(0, score));

  return {
    categorie: "Participation Tontine",
    score: Math.round(score),
    maxScore,
    description: `${participationsActives.length} tontine(s) active(s)`,
    indicateurs: {
      participationsActives: participationsActives.length,
      totalCotisations,
      penalites: penalites.length,
      aRecuBenefice
    }
  };
}

// ============================================================================
// CALCUL CAPACITÉ FINANCIÈRE
// ============================================================================

function calculerScoreCapacite(
  revenuMensuel: number,
  chargesMensuelles: number,
  montantDemande: number,
  dureeMois: number,
  alertes: string[],
  atouts: string[]
): ScoreDetail {
  const maxScore = POIDS.CAPACITE_FINANCIERE;
  let score = 0;

  const revenuNet = revenuMensuel - chargesMensuelles;
  const echeanceMensuelle = montantDemande / dureeMois;
  const tauxEndettement = revenuNet > 0 ? (echeanceMensuelle / revenuNet) * 100 : 100;

  // Score selon le taux d'endettement
  if (tauxEndettement <= 25) {
    score = maxScore;
    atouts.push(`Capacité de remboursement excellente (${tauxEndettement.toFixed(0)}%)`);
  } else if (tauxEndettement <= 33) {
    score = maxScore * 0.9;
    atouts.push(`Bonne capacité de remboursement (${tauxEndettement.toFixed(0)}%)`);
  } else if (tauxEndettement <= 40) {
    score = maxScore * 0.7;
  } else if (tauxEndettement <= 50) {
    score = maxScore * 0.5;
    alertes.push(`Taux d'endettement élevé: ${tauxEndettement.toFixed(0)}%`);
  } else if (tauxEndettement <= 60) {
    score = maxScore * 0.25;
    alertes.push(`Taux d'endettement très élevé: ${tauxEndettement.toFixed(0)}%`);
  } else {
    score = 0;
    alertes.push(`Capacité de remboursement insuffisante (${tauxEndettement.toFixed(0)}%)`);
  }

  // Vérifier le revenu minimum
  if (revenuMensuel < 50000) {
    score *= 0.8;
    alertes.push("Revenu mensuel faible");
  } else if (revenuMensuel >= 200000) {
    score = Math.min(maxScore, score * 1.1);
  }

  return {
    categorie: "Capacité Financière",
    score: Math.round(score),
    maxScore,
    description: `Endettement: ${tauxEndettement.toFixed(0)}%`,
    indicateurs: {
      revenuMensuel,
      chargesMensuelles,
      revenuNet,
      echeanceMensuelle,
      tauxEndettement: Math.round(tauxEndettement)
    }
  };
}

// ============================================================================
// CALCUL ANCIENNETÉ RELATION
// ============================================================================

function calculerScoreAnciennete(
  client: any,
  comptesClient: any[],
  alertes: string[],
  atouts: string[]
): ScoreDetail {
  const maxScore = POIDS.ANCIENNETE_RELATION;
  let score = 0;

  // Calculer l'ancienneté en mois
  const dateCreation = new Date(client.createdAt || new Date());
  const maintenant = new Date();
  const ancienneteMois = Math.floor(
    (maintenant.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );

  // Points selon l'ancienneté
  if (ancienneteMois >= 24) {
    score += 6;
    atouts.push(`Client fidèle depuis ${Math.floor(ancienneteMois / 12)} an(s)`);
  } else if (ancienneteMois >= 12) {
    score += 4;
    atouts.push("Client depuis plus d'un an");
  } else if (ancienneteMois >= 6) {
    score += 2;
  } else if (ancienneteMois < 3) {
    alertes.push("Nouveau client (moins de 3 mois)");
  }

  // Bonus pour profil complet
  const profilComplet = client.telephone && client.adresse &&
    (client.email || client.profession);
  if (profilComplet) {
    score += 2;
  }

  // Bonus pour segment VIP/Premium
  if (client.segment === SegmentClient.VIP) {
    score += 2;
    atouts.push("Client VIP");
  } else if (client.segment === SegmentClient.PREMIUM) {
    score += 1;
  }

  // Normaliser
  score = Math.min(maxScore, Math.max(0, score));

  return {
    categorie: "Ancienneté Relation",
    score: Math.round(score),
    maxScore,
    description: `${ancienneteMois} mois d'ancienneté`,
    indicateurs: {
      ancienneteMois,
      segment: client.segment,
      profilComplet
    }
  };
}

// ============================================================================
// FONCTION UTILITAIRE POUR MISE À JOUR AUTOMATIQUE
// ============================================================================

export async function mettreAJourScoreClient(clientId: string): Promise<{ score: number; segment: string }> {
  // Récupérer la dernière demande pour avoir les paramètres
  const derniereDemande = await db.query.demandesCredit.findFirst({
    where: eq(demandesCredit.clientId, clientId),
    orderBy: desc(demandesCredit.createdAt)
  });

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId)
  });

  if (!client) {
    throw new Error("Client non trouvé");
  }

  // Calculer avec des valeurs par défaut si pas de demande
  const result = await calculerScoreMicrofinance({
    clientId,
    montantDemande: derniereDemande ? parseFloat(derniereDemande.montantDemande) : 100000,
    dureeMois: derniereDemande?.dureeValeur || 6,
    revenuMensuel: parseFloat(client.revenuMensuel || '0'),
    chargesMensuelles: derniereDemande?.chargesMensuelles ? parseFloat(derniereDemande.chargesMensuelles.toString()) : 0
  });

  // Déterminer le segment basé sur le score
  let segment: string = SegmentClient.STANDARD;
  if (result.score >= 75) segment = SegmentClient.VIP;
  else if (result.score >= 60) segment = SegmentClient.PREMIUM;
  else if (result.score < 40) segment = SegmentClient.RISQUE;

  // Mettre à jour le client
  await db.update(clients)
    .set({
      score: result.score,
      segment,
      updatedAt: new Date()
    })
    .where(eq(clients.id, clientId));

  return { score: result.score, segment };
}
