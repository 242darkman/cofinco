import { Router } from "express";
/**
 * Routes RH — Réconciliation bancaire de la paie et diagnostic des écarts.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/paie/diagnostic
 *   GET    /api/hr/paie/reconciliation
 *   POST   /api/hr/paie/reconciliation
 *   GET    /api/hr/paie/reconciliation/:id
 *   POST   /api/hr/paie/reconciliation/:id/import
 *   POST   /api/hr/paie/reconciliation/:id/auto-match
 *   PATCH  /api/hr/paie/reconciliation/:id/lines/:lineId
 *   POST   /api/hr/paie/reconciliation/:id/complete
 */
import { db } from "../../db";
import { employes, payrollConfig, payrollPaymentBatches, payrollBatchItems, bankReconciliationSessions, bankReconciliationLines } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import * as hrStorage from "../../storage/hr";
import { bankStatementUpload } from "./shared";

export const paieReconciliationRouter = Router();

// GET /api/hr/paie/diagnostic - Diagnostic paie pour l'utilisateur connecté
/**
 * GET /api/hr/paie/diagnostic
 */
paieReconciliationRouter.get("/paie/diagnostic", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        const diagnostic: Record<string, any> = {
            userId,
            userName: req.user?.nom,
            userAgenceId: req.user?.agenceId,
        };

        // 1. Vérifier si l'utilisateur a un profil employé
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            diagnostic.employe = null;
            diagnostic.probleme = 'AUCUN_PROFIL_EMPLOYE';
            diagnostic.explication = "Cet utilisateur n'a pas de fiche dans la table 'employes'. La paie ne peut pas être générée ni consultée.";
            return res.json(diagnostic);
        }

        diagnostic.employe = {
            id: employe.id,
            statut: employe.statut,
            agenceId: employe.agenceId,
            salaireBase: employe.salaireBase,
            modeCalculPaie: employe.modeCalculPaie,
        };

        // 2. Vérifier le statut
        if (employe.statut !== 'ACTIVE') {
            diagnostic.probleme = 'STATUT_NON_ACTIF';
            diagnostic.explication = `Le statut de l'employé est '${employe.statut}'. Seuls les employés avec statut 'ACTIVE' sont inclus dans la génération de paie.`;
        }

        // 3. Vérifier les bulletins existants
        const bulletins = await storage.getBulletins(employe.id);
        diagnostic.bulletinsCount = bulletins.length;
        diagnostic.bulletins = bulletins.map((b: any) => ({
            id: b.id,
            mois: b.mois,
            statut: b.statut,
            salaireNet: b.salaireNet,
        }));

        // 4. Vérifier la correspondance d'agence avec la config paie
        if (employe.agenceId) {
            const [configAgence] = await db
                .select()
                .from(payrollConfig)
                .where(eq(payrollConfig.agenceId, employe.agenceId))
                .limit(1);
            diagnostic.configPaieAgence = configAgence ? 'OK' : 'MANQUANTE';
            if (!configAgence) {
                diagnostic.probleme = diagnostic.probleme || 'CONFIG_PAIE_MANQUANTE';
                diagnostic.explication = (diagnostic.explication || '') + ` Aucune configuration paie trouvée pour l'agence ${employe.agenceId}.`;
            }
        } else {
            diagnostic.probleme = diagnostic.probleme || 'AGENCE_MANQUANTE';
            diagnostic.explication = (diagnostic.explication || '') + " L'employé n'a pas d'agence assignée (agenceId null). Il sera exclu si le générateur filtre par agence.";
        }

        if (!diagnostic.probleme && bulletins.length === 0) {
            diagnostic.probleme = 'AUCUN_BULLETIN';
            diagnostic.explication = "Le profil employé est correct et actif, mais aucun bulletin n'a été généré. Vérifiez que la génération de paie a été lancée pour l'agence de cet employé.";
        }

        if (!diagnostic.probleme) {
            diagnostic.probleme = null;
            diagnostic.explication = 'Tout semble correct. Les bulletins sont disponibles.';
        }

        res.json(diagnostic);
    } catch (error) {
        logger.error({ err: error }, 'Erreur diagnostic paie');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// =============================================================================
// BANK RECONCILIATION
// =============================================================================

// GET /api/hr/paie/reconciliation - Liste des sessions
/**
 * GET /api/hr/paie/reconciliation
 */
paieReconciliationRouter.get("/paie/reconciliation", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const filter: { period?: string; bankName?: string } = {};
        if (req.query.period) filter.period = req.query.period as string;
        if (req.query.bankName) filter.bankName = req.query.bankName as string;
        const sessions = await hrStorage.getReconciliationSessions(filter);
        res.json(sessions);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération sessions rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation - Créer une session
/**
 * POST /api/hr/paie/reconciliation
 */
paieReconciliationRouter.post("/paie/reconciliation", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;
        const { period, bankName } = req.body;

        if (!period || !bankName) {
            return res.status(400).json({ error: "period et bankName sont requis" });
        }

        const [session] = await db.insert(bankReconciliationSessions).values({
            period,
            bankName,
            statut: 'DRAFT',
            createdBy: user.id,
        }).returning();

        // Auto-populate with transfer lines from matching batches
        const batches = await db.select()
            .from(payrollPaymentBatches)
            .innerJoin(payrollBatchItems, eq(payrollBatchItems.batchId, payrollPaymentBatches.id))
            .where(and(
                eq(payrollPaymentBatches.bankName, bankName),
                sql`EXISTS (SELECT 1 FROM payroll_runs pr WHERE pr.id = ${payrollPaymentBatches.payrollRunId} AND pr.period = ${period})`
            ));

        if (batches.length > 0) {
            await db.insert(bankReconciliationLines).values(
                batches.map(b => ({
                    sessionId: session.id,
                    source: 'TRANSFER' as const,
                    reference: `Virement paie ${period} - ${b.payroll_batch_items.employeNom}`,
                    employeNom: b.payroll_batch_items.employeNom,
                    montant: b.payroll_batch_items.montantNet,
                    batchItemId: b.payroll_batch_items.id,
                    matchStatus: 'UNMATCHED' as const,
                }))
            );
        }

        await hrStorage.updateReconciliationSessionStats(session.id);
        const result = await hrStorage.getReconciliationSessionById(session.id);
        res.status(201).json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur création session rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/paie/reconciliation/:id - Détail d'une session
/**
 * GET /api/hr/paie/reconciliation/:id
 */
paieReconciliationRouter.get("/paie/reconciliation/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const session = await hrStorage.getReconciliationSessionById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session introuvable" });
        res.json(session);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération session rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation/:id/import - Importer relevé bancaire CSV
/**
 * POST /api/hr/paie/reconciliation/:id/import
 */
paieReconciliationRouter.post("/paie/reconciliation/:id/import", getAuthUser, attachAbility, bankStatementUpload.single('file'), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        if (!req.file) return res.status(400).json({ error: "Fichier requis" });

        const sessionId = req.params.id;
        const [session] = await db.select().from(bankReconciliationSessions)
            .where(eq(bankReconciliationSessions.id, sessionId));
        if (!session) return res.status(404).json({ error: "Session introuvable" });

        // Parse CSV - expect columns: reference/libelle, nom, montant, date_valeur
        const content = req.file.buffer.toString('utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        if (lines.length < 2) {
            return res.status(400).json({ error: "Le fichier doit contenir au moins un en-tête et une ligne de données" });
        }

        const separator = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ''));

        // Find column indices
        const refIdx = headers.findIndex(h => h.includes('reference') || h.includes('libelle') || h.includes('ref'));
        const nameIdx = headers.findIndex(h => h.includes('nom') || h.includes('beneficiaire') || h.includes('name'));
        const amountIdx = headers.findIndex(h => h.includes('montant') || h.includes('amount') || h.includes('debit'));
        const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('valeur'));

        if (amountIdx === -1) {
            return res.status(400).json({ error: "Colonne montant introuvable dans le fichier" });
        }

        const bankLines = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(separator).map(c => c.trim().replace(/"/g, ''));
            const montant = Math.abs(parseInt(cols[amountIdx]?.replace(/[^\d-]/g, '') || '0'));
            if (montant === 0) continue;

            bankLines.push({
                sessionId,
                source: 'BANK' as const,
                reference: refIdx >= 0 ? cols[refIdx] || null : null,
                employeNom: nameIdx >= 0 ? cols[nameIdx] || null : null,
                montant,
                dateValeur: dateIdx >= 0 ? cols[dateIdx] || null : null,
                matchStatus: 'UNMATCHED' as const,
            });
        }

        if (bankLines.length === 0) {
            return res.status(400).json({ error: "Aucune ligne valide trouvée dans le fichier" });
        }

        await db.insert(bankReconciliationLines).values(bankLines);

        // Update session
        await db.update(bankReconciliationSessions)
            .set({ importFileName: req.file.originalname, statut: 'IN_PROGRESS' })
            .where(eq(bankReconciliationSessions.id, sessionId));

        await hrStorage.updateReconciliationSessionStats(sessionId);
        const result = await hrStorage.getReconciliationSessionById(sessionId);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur import relevé bancaire");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation/:id/auto-match - Lancer matching automatique
/**
 * POST /api/hr/paie/reconciliation/:id/auto-match
 */
paieReconciliationRouter.post("/paie/reconciliation/:id/auto-match", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const sessionId = req.params.id;
        const allLines = await db.select()
            .from(bankReconciliationLines)
            .where(eq(bankReconciliationLines.sessionId, sessionId));

        const transferLines = allLines.filter(l => l.source === 'TRANSFER' && l.matchStatus === 'UNMATCHED');
        const bankLines = allLines.filter(l => l.source === 'BANK' && l.matchStatus === 'UNMATCHED');

        let matchCount = 0;

        for (const tl of transferLines) {
            // Try to find a matching bank line by amount + name similarity
            const match = bankLines.find(bl => {
                if (bl.matchStatus !== 'UNMATCHED') return false;
                // Exact amount match
                if (bl.montant !== tl.montant) return false;
                // Name similarity (optional bonus, not required)
                return true;
            });

            if (match) {
                // Mark both as matched
                await db.update(bankReconciliationLines)
                    .set({ matchStatus: 'MATCHED', matchedWithId: match.id })
                    .where(eq(bankReconciliationLines.id, tl.id));
                await db.update(bankReconciliationLines)
                    .set({ matchStatus: 'MATCHED', matchedWithId: tl.id })
                    .where(eq(bankReconciliationLines.id, match.id));

                // Remove from available pool
                match.matchStatus = 'MATCHED' as any;
                matchCount++;
            }
        }

        await hrStorage.updateReconciliationSessionStats(sessionId);
        const result = await hrStorage.getReconciliationSessionById(sessionId);
        res.json({ matchCount, session: result });
    } catch (error) {
        logger.error({ err: error }, "Erreur matching automatique");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/paie/reconciliation/:id/lines/:lineId - Match/ignore/unmatch manuel
/**
 * PATCH /api/hr/paie/reconciliation/:id/lines/:lineId
 */
paieReconciliationRouter.patch("/paie/reconciliation/:id/lines/:lineId", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const { matchStatus, matchedWithId, notes } = req.body;
        const updateData: any = {};

        if (matchStatus) updateData.matchStatus = matchStatus;
        if (matchedWithId !== undefined) updateData.matchedWithId = matchedWithId;
        if (notes !== undefined) updateData.notes = notes;

        // If matching, also update the other line
        if (matchStatus === 'MATCHED' && matchedWithId) {
            await db.update(bankReconciliationLines)
                .set({ matchStatus: 'MATCHED', matchedWithId: req.params.lineId })
                .where(eq(bankReconciliationLines.id, matchedWithId));
        }

        // If unmatching, also unmatch the other line
        if (matchStatus === 'UNMATCHED') {
            const [currentLine] = await db.select()
                .from(bankReconciliationLines)
                .where(eq(bankReconciliationLines.id, req.params.lineId));
            if (currentLine?.matchedWithId) {
                await db.update(bankReconciliationLines)
                    .set({ matchStatus: 'UNMATCHED', matchedWithId: null })
                    .where(eq(bankReconciliationLines.id, currentLine.matchedWithId));
            }
            updateData.matchedWithId = null;
        }

        const [updated] = await db.update(bankReconciliationLines)
            .set(updateData)
            .where(eq(bankReconciliationLines.id, req.params.lineId))
            .returning();

        if (!updated) return res.status(404).json({ error: "Ligne introuvable" });

        await hrStorage.updateReconciliationSessionStats(req.params.id);
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification ligne rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/paie/reconciliation/:id/complete - Clôturer session
/**
 * POST /api/hr/paie/reconciliation/:id/complete
 */
paieReconciliationRouter.post("/paie/reconciliation/:id/complete", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;

        const [updated] = await db.update(bankReconciliationSessions)
            .set({ statut: 'COMPLETED', completedAt: new Date(), completedBy: user.id })
            .where(eq(bankReconciliationSessions.id, req.params.id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Session introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur clôture session rapprochement");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
