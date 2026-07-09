import { Router } from "express";
/**
 * Routes RH — Onboarding des nouveaux employés.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/onboarding/checklists
 *   POST   /api/hr/onboarding/checklists
 *   PUT    /api/hr/onboarding/checklists/:id
 *   DELETE /api/hr/onboarding/checklists/:id
 *   GET    /api/hr/onboarding/instances
 *   GET    /api/hr/onboarding/instances/:id
 *   POST   /api/hr/onboarding/start
 *   POST   /api/hr/onboarding/instances/:id/complete-item
 *   POST   /api/hr/onboarding/instances/:id/uncomplete-item
 *   POST   /api/hr/onboarding/convert-to-employee
 *   POST   /api/hr/onboarding/instances/:id/cancel
 */
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { onboardingService } from "../../services/onboarding-service";
import { getWsInstance } from "../../ws-server";

export const onboardingRouter = Router();

/**
 * ========================================
 * ONBOARDING PIPELINE
 * ========================================
 */

// GET /api/hr/onboarding/checklists - Liste des checklists d'onboarding
/**
 * GET /api/hr/onboarding/checklists
 */
onboardingRouter.get("/onboarding/checklists", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { agenceId } = req.query;
    const checklists = await onboardingService.getChecklists(agenceId as string | undefined);
    res.json(checklists);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération checklists onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/checklists - Créer une checklist
/**
 * POST /api/hr/onboarding/checklists
 */
onboardingRouter.post("/onboarding/checklists", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { agenceId, nom, description, items } = req.body;

    if (!nom || !items) {
      return res.status(400).json({ error: "nom et items requis" });
    }

    const checklist = await onboardingService.upsertChecklist({
      agenceId,
      nom,
      description,
      items,
      createdBy: req.user?.id,
    });

    res.status(201).json(checklist);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création checklist onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/hr/onboarding/checklists/:id - Mettre à jour une checklist
/**
 * PUT /api/hr/onboarding/checklists/:id
 */
onboardingRouter.put("/onboarding/checklists/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, description, items } = req.body;

    const checklist = await onboardingService.upsertChecklist({
      id,
      nom,
      description,
      items,
    });

    res.json(checklist);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour checklist onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/onboarding/checklists/:id - Supprimer une checklist
/**
 * DELETE /api/hr/onboarding/checklists/:id
 */
onboardingRouter.delete("/onboarding/checklists/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    await onboardingService.deleteChecklist(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression checklist onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/onboarding/instances - Liste des instances d'onboarding
/**
 * GET /api/hr/onboarding/instances
 */
onboardingRouter.get("/onboarding/instances", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { candidatureId, employeId, statut, assignedTo } = req.query;
    const instances = await onboardingService.getInstances({
      candidatureId: candidatureId ? parseInt(candidatureId as string) : undefined,
      employeId: employeId as string | undefined,
      statut: statut as string | undefined,
      assignedTo: assignedTo as string | undefined,
    });
    res.json(instances);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération instances onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/onboarding/instances/:id - Détail d'une instance
/**
 * GET /api/hr/onboarding/instances/:id
 */
onboardingRouter.get("/onboarding/instances/:id", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { id } = req.params;
    const instance = await onboardingService.getInstance(id);

    if (!instance) {
      return res.status(404).json({ error: "Instance non trouvée" });
    }

    res.json(instance);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération instance onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/start - Démarrer l'onboarding pour une candidature
/**
 * POST /api/hr/onboarding/start
 */
onboardingRouter.post("/onboarding/start", getAuthUser, attachAbility, requireAbility(Actions.CREATE, Subjects.EMPLOYE), async (req, res) => {
  try {
    const { candidatureId, checklistId, assignedTo } = req.body;

    if (!candidatureId || !checklistId) {
      return res.status(400).json({ error: "candidatureId et checklistId requis" });
    }

    const result = await onboardingService.startOnboarding(
      candidatureId,
      checklistId,
      assignedTo || req.user?.id
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'onboarding_started', candidatureId } });
    }

    res.status(201).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur démarrage onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/instances/:id/complete-item - Compléter un item
/**
 * POST /api/hr/onboarding/instances/:id/complete-item
 */
onboardingRouter.post("/onboarding/instances/:id/complete-item", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName, notes } = req.body;

    if (!itemName) {
      return res.status(400).json({ error: "itemName requis" });
    }

    const result = await onboardingService.completeItem(id, itemName, req.user?.id, notes);

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'onboarding_item_completed', instanceId: id } });
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur completion item onboarding');
    res.status(400).json({ error: error.message || "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/instances/:id/uncomplete-item - Démarquer un item
/**
 * POST /api/hr/onboarding/instances/:id/uncomplete-item
 */
onboardingRouter.post("/onboarding/instances/:id/uncomplete-item", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName } = req.body;

    if (!itemName) {
      return res.status(400).json({ error: "itemName requis" });
    }

    const result = await onboardingService.uncompleteItem(id, itemName);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur démarquage item onboarding');
    res.status(400).json({ error: error.message || "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/convert-to-employee - Convertir candidat en employé
/**
 * POST /api/hr/onboarding/convert-to-employee
 */
onboardingRouter.post("/onboarding/convert-to-employee", getAuthUser, attachAbility, requireAbility(Actions.CREATE, Subjects.EMPLOYE), async (req, res) => {
  try {
    const { candidatureId, employeData } = req.body;

    if (!candidatureId || !employeData?.agenceId) {
      return res.status(400).json({ error: "candidatureId et employeData.agenceId requis" });
    }

    const result = await onboardingService.createEmployeeFromCandidate(
      candidatureId,
      employeData
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "HR_UPDATE",
        payload: { type: 'employee_created_from_candidate', candidatureId, employeId: result.employe?.id }
      });
    }

    res.status(201).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur conversion candidat en employé');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/onboarding/instances/:id/cancel - Annuler l'onboarding
/**
 * POST /api/hr/onboarding/instances/:id/cancel
 */
onboardingRouter.post("/onboarding/instances/:id/cancel", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await onboardingService.cancelOnboarding(id, reason);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur annulation onboarding');
    res.status(500).json({ error: "Erreur serveur" });
  }
});
