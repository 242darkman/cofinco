/**
 * Routeur RH — index.
 *
 * Le module RH est découpé par domaine (AGENTS.md §8 : 400 lignes max par
 * fichier). Chaque sous-routeur enregistre ses chemins complets relatifs à
 * /api/hr ; l'ordre de montage préserve l'ordre d'enregistrement historique
 * des routes.
 *
 * Sous-modules :
 *   - hr/rapports.ts — Rapports et analytique RH.
 *   - hr/conges.ts — Congés : demandes, soldes et vue équipe.
 *   - hr/conges-validation.ts — Congés : circuit d'approbation et de refus des demandes.
 *   - hr/formations.ts — Formations : catalogue et participants.
 *   - hr/formations-suivi.ts — Formations : évaluation des participants, certificats et conformité.
 *   - hr/documents.ts — Documents RH : demandes de documents, dossiers et attestations.
 *   - hr/employes.ts — Employés : fiches, import CSV, organigramme et audit RH.
 *   - hr/sanctions.ts — Sanctions disciplinaires : déclaration et gestion.
 *   - hr/sanctions-workflow.ts — Sanctions : workflow d'escalade et règles d'escalade automatiques.
 *   - hr/candidatures.ts — Recrutement : candidatures et scoring automatique.
 *   - hr/hiring-approval.ts — Approbations d'embauche (workflow hiérarchique).
 *   - hr/onboarding.ts — Onboarding des nouveaux employés.
 *   - hr/bulletins.ts — Bulletins de paie : génération PDF et distribution aux employés.
 *   - hr/paie-cycle.ts — Cycle de paie : génération, validation, planification et relance des runs.
 *   - hr/paie-runs.ts — Consultation des runs de paie, bulletins individuels et configuration de la paie.
 *   - hr/paie-paiements.ts — Exécution des paiements de salaires : virements, lots, confirmation et suivi des jobs.
 *   - hr/paie-reconciliation.ts — Réconciliation bancaire de la paie et diagnostic des écarts.
 *   - hr/espace-personnel.ts — Espace personnel de l'employé connecté : mes demandes, alertes et compteurs.
 *   - hr/avantages.ts — Avantages sociaux des employés.
 *   - hr/presence.ts — Présence : pointages et horaires de travail.
 *   - hr/attendance.ts — Feuilles de temps, allocation du temps et assiduité.
 *   - hr/direction-generale.ts — Validations et vues réservées à la direction générale.
 *   - hr/projets.ts — Projets et modèles de shifts pour la planification.
 *   - hr/baremes.ts — Barèmes salariaux.
 *   - hr/avances.ts — Avances sur salaire.
 *   - hr/evaluations.ts — Évaluations de performance : campagnes, notation et finalisation.
 *   - hr/evaluations-suivi.ts — Évaluations de performance : notation, finalisation et suivi.
 *   - hr/job-offers.ts — Recrutement : offres d'emploi.
 */
import { Router } from "express";
import { rapportsRouter } from "./hr/rapports";
import { congesRouter } from "./hr/conges";
import { congesValidationRouter } from "./hr/conges-validation";
import { formationsRouter } from "./hr/formations";
import { formationsSuiviRouter } from "./hr/formations-suivi";
import { documentsRouter } from "./hr/documents";
import { employesRouter } from "./hr/employes";
import { sanctionsRouter } from "./hr/sanctions";
import { sanctionsWorkflowRouter } from "./hr/sanctions-workflow";
import { candidaturesRouter } from "./hr/candidatures";
import { hiringApprovalRouter } from "./hr/hiring-approval";
import { onboardingRouter } from "./hr/onboarding";
import { bulletinsRouter } from "./hr/bulletins";
import { paieCycleRouter } from "./hr/paie-cycle";
import { paieRunsRouter } from "./hr/paie-runs";
import { paiePaiementsRouter } from "./hr/paie-paiements";
import { paieReconciliationRouter } from "./hr/paie-reconciliation";
import { espacePersonnelRouter } from "./hr/espace-personnel";
import { avantagesRouter } from "./hr/avantages";
import { presenceRouter } from "./hr/presence";
import { attendanceRouter } from "./hr/attendance";
import { directionGeneraleRouter } from "./hr/direction-generale";
import { projetsRouter } from "./hr/projets";
import { baremesRouter } from "./hr/baremes";
import { avancesRouter } from "./hr/avances";
import { evaluationsRouter } from "./hr/evaluations";
import { evaluationsSuiviRouter } from "./hr/evaluations-suivi";
import { jobOffersRouter } from "./hr/job-offers";

export const hrRouter = Router();

hrRouter.use(rapportsRouter);
hrRouter.use(congesRouter);
hrRouter.use(congesValidationRouter);
hrRouter.use(formationsRouter);
hrRouter.use(formationsSuiviRouter);
hrRouter.use(documentsRouter);
hrRouter.use(employesRouter);
hrRouter.use(sanctionsRouter);
hrRouter.use(sanctionsWorkflowRouter);
hrRouter.use(candidaturesRouter);
hrRouter.use(hiringApprovalRouter);
hrRouter.use(onboardingRouter);
hrRouter.use(bulletinsRouter);
hrRouter.use(paieCycleRouter);
hrRouter.use(paieRunsRouter);
hrRouter.use(paiePaiementsRouter);
hrRouter.use(paieReconciliationRouter);
hrRouter.use(espacePersonnelRouter);
hrRouter.use(avantagesRouter);
hrRouter.use(presenceRouter);
hrRouter.use(attendanceRouter);
hrRouter.use(directionGeneraleRouter);
hrRouter.use(projetsRouter);
hrRouter.use(baremesRouter);
hrRouter.use(avancesRouter);
hrRouter.use(evaluationsRouter);
hrRouter.use(evaluationsSuiviRouter);
hrRouter.use(jobOffersRouter);
