import { Router } from "express";
/**
 * Routes RH — Avances sur salaire.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/avances
 *   POST   /api/hr/avances
 *   PATCH  /api/hr/avances/:id/approve
 *   PATCH  /api/hr/avances/:id/reject
 *   PATCH  /api/hr/avances/:id/pay
 *   PATCH  /api/hr/avances/:id/deduct
 */
import { db } from "../../db";
import { employes, avancesSalaire, insertAvanceSalaireSchema, StatutAvance } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { postRunEngagement, postRunPayment, reverseRunGL, postAdvancePaymentGL } from "../../services/hr-accounting-service";
import { users } from "@shared/schema";
import { broadcastHrUpdate, broadcastHrEvent } from "./shared";

export const avancesRouter = Router();

// ============================================
// SALARY ADVANCES (Avances sur Salaire)
// ============================================

// GET /api/hr/avances - List salary advances (filtered by employee for non-RH)
/**
 * GET /api/hr/avances
 */
avancesRouter.get("/avances", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = req.user as any;
        const isRH = req.ability?.can(Actions.MANAGE, Subjects.RH);
        const { employeId, statut } = req.query;

        let conditions: any[] = [];

        // Non-RH users can only see their own advances
        if (!isRH && user.employeId) {
            conditions.push(eq(avancesSalaire.employeId, user.employeId));
        } else if (employeId) {
            conditions.push(eq(avancesSalaire.employeId, employeId as string));
        }

        if (statut) {
            conditions.push(eq(avancesSalaire.statut, statut as string));
        }

        const result = await db
            .select({
                avance: avancesSalaire,
                employeNom: sql<string>`COALESCE(${users.prenom} || ' ' || ${users.nom}, 'N/A')`,
                approuveParNom: sql<string>`(SELECT u2.username FROM users u2 WHERE u2.id = ${avancesSalaire.approuvePar})`,
            })
            .from(avancesSalaire)
            .leftJoin(employes, eq(avancesSalaire.employeId, employes.id))
            .leftJoin(users, eq(employes.userId, users.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(avancesSalaire.dateDemande));

        const avances = result.map(r => ({
            ...r.avance,
            employeNom: r.employeNom,
            approuveParNom: r.approuveParNom,
        }));

        res.json(avances);
    } catch (error) {
        logger.error({ err: error }, 'Erreur liste avances');
        res.status(500).json({ error: "Erreur lors du chargement des avances" });
    }
});

// POST /api/hr/avances - Create a salary advance request
/**
 * POST /api/hr/avances
 */
avancesRouter.post("/avances", getAuthUser, attachAbility, requireAbility(Actions.CREATE, Subjects.PAIE), async (req, res) => {
    try {
        const parsed = insertAvanceSalaireSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const [avance] = await db.insert(avancesSalaire).values({
            ...parsed.data,
            statut: StatutAvance.PENDING,
        }).returning();

        // Broadcast HR update
        broadcastHrEvent({
            entity: 'paie',
            action: 'created',
            id: avance.id,
            employeId: avance.employeId,
            extra: { type: 'avance', montant: avance.montant },
        });

        res.status(201).json(avance);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création avance');
        res.status(500).json({ error: "Erreur lors de la création de l'avance" });
    }
});

// PATCH /api/hr/avances/:id/approve - Approve a salary advance
/**
 * PATCH /api/hr/avances/:id/approve
 */
avancesRouter.patch("/avances/:id/approve", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user as any;

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.PENDING) {
            return res.status(400).json({ error: `Impossible d'approuver une avance au statut ${existing.statut}` });
        }

        const [updated] = await db.update(avancesSalaire)
            .set({
                statut: StatutAvance.APPROVED,
                approuvePar: user.id,
                approuveAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(avancesSalaire.id, id))
            .returning();

        broadcastHrEvent({
            entity: 'paie',
            action: 'approved',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance', montant: updated.montant },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur approbation avance');
        res.status(500).json({ error: "Erreur lors de l'approbation" });
    }
});

// PATCH /api/hr/avances/:id/reject - Reject a salary advance
/**
 * PATCH /api/hr/avances/:id/reject
 */
avancesRouter.patch("/avances/:id/reject", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const { motif } = req.body;

        if (!motif) return res.status(400).json({ error: "Le motif de rejet est obligatoire" });

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.PENDING) {
            return res.status(400).json({ error: `Impossible de rejeter une avance au statut ${existing.statut}` });
        }

        const user = req.user as any;
        const [updated] = await db.update(avancesSalaire)
            .set({
                statut: StatutAvance.REJECTED,
                rejeteMotif: motif,
                approuvePar: user.id,
                approuveAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(avancesSalaire.id, id))
            .returning();

        broadcastHrEvent({
            entity: 'paie',
            action: 'rejected',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance' },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur rejet avance');
        res.status(500).json({ error: "Erreur lors du rejet" });
    }
});

// PATCH /api/hr/avances/:id/pay - Mark salary advance as paid
/**
 * PATCH /api/hr/avances/:id/pay
 */
avancesRouter.patch("/avances/:id/pay", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const agenceId = req.user?.agenceId;

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.APPROVED) {
            return res.status(400).json({ error: `Impossible de payer une avance au statut ${existing.statut}` });
        }

        // Resolve employee name for GL metadata
        const [emp] = await db.select({ nom: users.nom, prenom: users.prenom })
            .from(employes)
            .leftJoin(users, eq(employes.userId, users.id))
            .where(eq(employes.id, existing.employeId));
        const employeNom = emp ? `${emp.nom || ''} ${emp.prenom || ''}`.trim() : existing.employeId;

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx.update(avancesSalaire)
                .set({
                    statut: StatutAvance.PAID,
                    payeAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(avancesSalaire.id, id))
                .returning();

            // Post GL entry: Debit 4212 (Avances personnel) / Credit 521 (Caisse)
            if (agenceId && userId) {
                try {
                    await postAdvancePaymentGL(row.id, row.montant, employeNom, agenceId, userId);
                } catch (glError) {
                    logger.error({ err: glError, advanceId: id }, 'GL posting failed for advance payment');
                }
            }

            return row;
        });

        broadcastHrUpdate({
            entity: 'paie',
            action: 'paid',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance', montant: updated.montant },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur paiement avance');
        res.status(500).json({ error: "Erreur lors du paiement" });
    }
});

// PATCH /api/hr/avances/:id/deduct - Mark salary advance as deducted from payroll
/**
 * PATCH /api/hr/avances/:id/deduct
 */
avancesRouter.patch("/avances/:id/deduct", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const { moisDeduction } = req.body;
        const userId = req.user?.id;
        const agenceId = req.user?.agenceId;

        const [existing] = await db.select().from(avancesSalaire).where(eq(avancesSalaire.id, id));
        if (!existing) return res.status(404).json({ error: "Avance non trouvée" });
        if (existing.statut !== StatutAvance.PAID) {
            return res.status(400).json({ error: `Impossible de déduire une avance au statut ${existing.statut}` });
        }

        // Resolve employee name for GL metadata
        const [emp] = await db.select({ nom: users.nom, prenom: users.prenom })
            .from(employes)
            .leftJoin(users, eq(employes.userId, users.id))
            .where(eq(employes.id, existing.employeId));
        const employeNom = emp ? `${emp.nom || ''} ${emp.prenom || ''}`.trim() : existing.employeId;
        const resolvedMois = moisDeduction || new Date().toISOString().slice(0, 7);

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx.update(avancesSalaire)
                .set({
                    statut: StatutAvance.DEDUCTED,
                    moisDeduction: resolvedMois,
                    updatedAt: new Date(),
                })
                .where(eq(avancesSalaire.id, id))
                .returning();

            // Advance deduction GL is now handled within payroll bulletin (code 4500)
            // No separate GL posting needed here

            return row;
        });

        broadcastHrUpdate({
            entity: 'paie',
            action: 'validated',
            id: updated.id,
            employeId: updated.employeId,
            extra: { type: 'avance_deducted' },
        });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur déduction avance');
        res.status(500).json({ error: "Erreur lors de la déduction" });
    }
});
