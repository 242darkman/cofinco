import type { Express } from "express";
import { insertClientSchema, insertTagSchema, insertClientTagSchema, insertClientActivitySchema, clientTags, clientActivities, users, clients, agences, membresTontine, mouvementsFinanciers, remboursements, contributionsTontine, clientDocumentSchema, clientDocumentsArraySchema, type ClientDocument } from "@shared/schema";

import { StorageService } from '../services/storage-service';
import { storage } from "../storage";
import { getClientTags, addClientTag, removeClientTag, createTag, getAllTags, logClientActivity, getClientActivities, getClientByUserId, getClientWithUser, getAllTypesMarches } from "../storage/clients";


import { requireAuth, requireRole, hashPassword } from "../auth";
import { requireAgenceAccess, validateAgenceAction, requireAgenceIdAccess, validateAgenceIdAction } from "../middleware";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep, coerceValueToSchema, parsePagination, paginateResponse } from "./utils";
import { calculateClientScore } from "../scoring-service";
import { z } from "zod";
import { db } from "../db";
import { eq, sql, or, isNull, and, gte, desc } from "drizzle-orm";
import { createClientAccount, getComptesByClient, getCreditsByClient, getDemandesByClient } from "../storage/finance";

export function registerClientRoutes(app: Express) {
  // CLIENTS ÉLIGIBLES AU CRÉDIT: Clients actifs avec un compte courant dans l'agence
  // MUST BE REGISTERED BEFORE /:id ROUTE TO AVOID COLLISIONS
  app.get("/api/clients/eligible-credit", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      const filter = agenceFilter || {};

      // Récupérer tous les clients de l'agence
      const allClients = await storage.getAllClients(filter);
      const activeClients = allClients.filter(c => c.status === 'Actif');

      // Pour chaque client, vérifier s'il a un compte courant actif dans l'agence
      const eligibleClients = [];

      for (const client of activeClients) {
        const accounts = await getComptesByClient(client.id);

        // Chercher un compte courant actif dans l'agence de la demande
        const compteCourant = accounts.find((acc: any) => {
          const isCompteCourant = acc.typeCompte === 'Courant';
          const isActif = acc.statut === 'Actif';

          // Vérifier l'agence du compte si un filtre agence est appliqué
          if (agenceFilter?.agenceId) {
            return isCompteCourant && isActif && acc.agenceId === agenceFilter.agenceId;
          }
          return isCompteCourant && isActif;
        });

        if (compteCourant) {
          // 🛑 RÈGLE MICROFINANCE : Pas de crédit actif ni demande en cours
          const credits = await getCreditsByClient(client.id);
          const hasActiveCredit = credits.some(c => ['Actif', 'En retard', 'En cours', 'Contentieux'].includes(c.statut));

          const demandes = await getDemandesByClient(client.id);
          const hasPendingDemand = demandes.some(d => d.statut && ['En attente', 'A enquêter', 'En comité', 'Approuvée'].includes(d.statut));

          if (!hasActiveCredit && !hasPendingDemand) {
              eligibleClients.push({
                ...client,
                compteCourantId: compteCourant.id,
                compteCourantNumero: compteCourant.numeroCompte,
                compteCourantSolde: compteCourant.soldeCourant
              });
          }
        }
      }

      const { page, perPage, offset } = parsePagination(req.query);
      const total = eligibleClients.length;
      const paged = eligibleClients.slice(offset, offset + perPage);
      res.json(
        paginateResponse(addSnakeCaseAliasesDeep(paged), total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          filters: filter,
        })
      );
    } catch (error) {
      console.error("Error fetching eligible clients:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des clients éligibles" });
    }
  });

  // LISTE CLIENTS : Filtrée par agence (supporte agenceId via header ou agence legacy)
  app.get("/api/clients", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // req.agenceFilter contient { agenceId: "..." } ou { agence: "..." } ou null (admin)
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      // On passe le filtre directement au storage qui l'applique en SQL
      const filter = agenceFilter || {};
      const { page, perPage } = parsePagination(req.query);
      const { data, total } = await storage.getClientsPaginated(filter, page, perPage);

      const transformed = addSnakeCaseAliasesDeep(data);
      res.json(
        paginateResponse(transformed, total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          filters: filter,
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // RECHERCHE : Filtrée par agence
  app.get("/api/clients/search", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) return res.json([]);

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        const filter = agenceFilter || {};

        const clients = await storage.getAllClients(filter);
        if (clients.length > 0) {
            console.log("[Debug] First client keys:", Object.keys(clients[0]));
            console.log("[Debug] First client sample:", JSON.stringify(clients[0], null, 2));
        }

        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

        const lowerQ = normalize(query);
        // Split query into words for multi-term search (e.g., "nzaba joseph" -> ["nzaba", "joseph"])
        const searchTerms = lowerQ.split(/\s+/).filter(Boolean);

        const filtered = clients.filter(c => {
            const nom = normalize(c.nom || '');
            const prenom = normalize(c.prenom || '');
            const email = (c.email || '').toLowerCase();
            const telephone = c.telephone || '';
            
            if (searchTerms.length > 1) {
                return searchTerms.every(term =>
                    nom.includes(term) ||
                    prenom.includes(term) ||
                    email.includes(term) ||
                    telephone.includes(term)
                );
            }

            const fullName = `${nom} ${prenom}`;
            const fullNameReverse = `${prenom} ${nom}`;
            
            return (
                nom.includes(lowerQ) ||
                prenom.includes(lowerQ) ||
                fullName.includes(lowerQ) ||
                fullNameReverse.includes(lowerQ) ||
                email.includes(lowerQ) ||
                telephone.includes(query)
            );
        });
        
        // Calculer l'éligibilité pour les résultats filtrés
        const enrichedResults = [];
        for (const client of filtered) {
            let isEligible = true;
            let ineligibilityReason = null;

            // 1. Statut Client
            if (client.status !== 'Actif') {
                isEligible = false;
                ineligibilityReason = "Client Inactif/Suspendu";
            }

            if (isEligible) {
                // 2. Compte Courant
                const accounts = await getComptesByClient(client.id);
                const hasCompteCourant = accounts.some(acc => 
                    acc.typeCompte === 'Courant' && 
                    acc.statut === 'Actif'
                );
                
                if (!hasCompteCourant) {
                    isEligible = false;
                    ineligibilityReason = "Pas de Compte Courant Actif";
                }
            }

            if (isEligible) {
                // 3. Crédit en cours
                const creditsList = await getCreditsByClient(client.id);
                const activeCredit = creditsList.find(c => 
                    ['Actif', 'En retard', 'En cours', 'Contentieux'].includes(c.statut)
                );
                
                if (activeCredit) {
                    isEligible = false;
                    ineligibilityReason = "Crédit en cours";
                }
            }

            if (isEligible) {
                // 4. Demande en cours
                const demandes = await getDemandesByClient(client.id);
                const pendingDemand = demandes.find(d => 
                    d.statut && ['En attente', 'A enquêter', 'En comité', 'Approuvée'].includes(d.statut)
                );

                if (pendingDemand) {
                    isEligible = false;
                    ineligibilityReason = "Dossier déjà en cours";
                }
            }

            enrichedResults.push({
                ...client,
                isEligible,
                ineligibilityReason
            });
        }
        
        console.log(`[Search] Found ${enrichedResults.length} results (Enriched)`);
        const { page, perPage, offset } = parsePagination(req.query);
        const total = enrichedResults.length;
        const paged = enrichedResults.slice(offset, offset + perPage);
        res.json(
          paginateResponse(addSnakeCaseAliasesDeep(paged), total, page, perPage, {
            path: `${req.baseUrl}${req.path}`,
            query: req.query,
            filters: { q: query },
          })
        );
    } catch (e) {
        res.status(500).json({ message: "Search failed" });
    }
  });

  // SEARCH WITH LOCATION: Filtré par agence
  app.get("/api/clients/with-location", requireAuth, requireAgenceIdAccess(), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      const filter = agenceFilter || {};

      const clients = await storage.getAllClients(filter);
      const withLoc = clients.filter(c => c.latitude && c.longitude);
      const { page, perPage, offset } = parsePagination(req.query);
      const total = withLoc.length;
      const paged = withLoc.slice(offset, offset + perPage);
      res.json(
        paginateResponse(addSnakeCaseAliasesDeep(paged), total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
          filters: filter,
        })
      );
  });



  // GET ONE: Vérification manuelle de l'agence
  app.get("/api/clients/:id", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    // Validate UUID to avoid crashing DB with invalid syntax (e.g. "eligible-credit" fallthrough)
    if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
    }

    const client = await storage.getClient(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    // Vérifier si l'utilisateur a le droit de voir ce client spécifique
    const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
    if (agenceFilter) {
      // Vérifier par agenceId (prioritaire) ou par agence (legacy)
      if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      } else if (agenceFilter.agence && client.agence !== agenceFilter.agence) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }
    }

    // Calcule des limites de retrait
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    // Début de semaine (Lundi)
    const startWeek = new Date(now);
    const day = startWeek.getDay() || 7; // Dimanche = 0 -> 7
    if (day !== 1) startWeek.setHours(-24 * (day - 1));
    startWeek.setHours(0, 0, 0, 0);

    // Début de mois
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Use mouvementsFinanciers (source of truth) to track all withdrawal types
    const withdrawalsToday = await storage.getMouvementsByClientAndDateRange(client.id, startToday, endToday, 'retrait');
    const withdrawalsWeek = await storage.getMouvementsByClientAndDateRange(client.id, startWeek, endToday, 'retrait');
    const withdrawalsMonth = await storage.getMouvementsByClientAndDateRange(client.id, startMonth, endToday, 'retrait');

    const sum = (ops: any[]) => ops.reduce((acc, op) => acc + Number(op.montant), 0);
    const usedToday = sum(withdrawalsToday);
    const usedWeek = sum(withdrawalsWeek);
    const usedMonth = sum(withdrawalsMonth);

    const result = {
      ...(addSnakeCaseAliasesDeep(client) as any),
      security_limits: {
        daily: {
          limit: Number(client.limiteRetraitJournalier),
          used: usedToday,
          remaining: Math.max(0, Number(client.limiteRetraitJournalier) - usedToday)
        },
        weekly: {
          limit: Number(client.limiteRetraitHebdomadaire),
          used: usedWeek,
          remaining: Math.max(0, Number(client.limiteRetraitHebdomadaire) - usedWeek)
        },
        monthly: {
          limit: Number(client.limiteRetraitMensuel),
          used: usedMonth,
          remaining: Math.max(0, Number(client.limiteRetraitMensuel) - usedMonth)
        }
      }
    };

    res.json(result);
  });

  // GET Client Comptes - For account type selector
  app.get("/api/clients/:id/comptes", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // Validate UUID
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      // Verify client exists and access
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter) {
        if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        } else if (agenceFilter.agence && client.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      // Get all accounts for this client
      const comptes = await getComptesByClient(req.params.id);
      
      res.json(addSnakeCaseAliasesDeep(comptes));
    } catch (error) {
      console.error("Error fetching client comptes:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des comptes" });
    }
  });

  // ============================================
  // COMPTES BANCAIRES (Refactored)
  // ============================================

  // GET Accounts
  app.get("/api/clients/:id/accounts", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // 1. Verify access to client
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter) {
        if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        } else if (agenceFilter.agence && client.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      // 2. Fetch accounts
      const accounts = await getComptesByClient(req.params.id);
      res.json(accounts);
    } catch (error) {
       console.error("Error fetching accounts:", error);
       res.status(500).json({ message: "Erreur chargement comptes" });
    }
  });

  // POST Account (Create)
  app.post("/api/clients/:id/accounts", requireAuth, requireRole('admin', 'chef'), requireAgenceIdAccess(), async (req, res) => {
      try {
        // 1. Verify access to client
        const client = await storage.getClient(req.params.id);
        if (!client) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          }
        }

        // 2. Validate input
        const schema = z.object({
            typeCompte: z.enum(['Courant', 'Épargne']),
            soldeInitial: z.coerce.number().min(0, "Le solde initial ne peut pas être négatif"),
            tauxInteret: z.coerce.number().min(0).default(0),
            statut: z.enum(['Actif', 'Suspendu', 'Fermé']).default('Actif'),
            methodePaiement: z.enum(['Espèces', 'Mobile Money', 'Virement', 'Carte']).optional()
        });

        const parsed = schema.parse(req.body);

        // 3. Create account atomically
        const account = await createClientAccount(req.params.id, parsed, req.session.user?.id);

        // 4. Log Audit
        await logAudit(
            req,
            "CREATE_ACCOUNT",
            "client",
            client.id,
            { type: parsed.typeCompte, numero: account.numeroCompte },
            "success",
            "medium"
        );

        // 5. Notify Real-Time Updates
        const wsServer = await import("../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            // Notify client update (force refresh of client details everywhere)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: client.id, agenceId: client.agenceId } });
            
            // Notify live activity
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Nouveau compte ${parsed.typeCompte} : ${account.numeroCompte}`,
                user: req.session.user?.nom || 'Système',
                type: 'finance',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId
              }
            });

            // Update dashboard stats if there was an invalidation needed
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
        }

        res.status(201).json(account);
      } catch (error) {
         if (error instanceof z.ZodError) return res.status(400).json(error);
         console.error("Error creating account:", error);
         res.status(500).json({ message: "Erreur création compte" });
      }
  });

  // UPDATE Account (PATCH)
  app.patch("/api/clients/:clientId/accounts/:accountId", requireAuth, requireRole('admin', 'chef'), requireAgenceIdAccess(), async (req, res) => {
      try {
        const { clientId, accountId } = req.params;
        
        // 1. Verify access to client
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          }
        }

        // 2. Validate input
        const schema = z.object({
            typeCompte: z.enum(['Courant', 'Épargne']).optional(),
            tauxInteret: z.coerce.number().min(0).optional(),
            statut: z.enum(['Actif', 'Suspendu', 'Fermé']).optional(),
            solde: z.coerce.number().optional()
        });

        const parsed = schema.parse(req.body);
        
        // Fetch current account to compare balance
        const currentAccount = await storage.getCompte(accountId);
        if (!currentAccount) return res.status(404).json({ message: "Compte introuvable" });

        // Handle Balance Correction (Safe Mode)
        if (parsed.solde !== undefined && parsed.solde !== Number(currentAccount.soldeCourant)) {
            const difference = parsed.solde - Number(currentAccount.soldeCourant);
            
            // Create automatic transaction line
            await storage.createTransactionCompte({
                compteId: accountId,
                typePaiement: (difference > 0 ? `Dépôt ${currentAccount.typeCompte}` : `Retrait ${currentAccount.typeCompte}`) as any,
                montant: Math.abs(difference).toString(),
                soldeApres: parsed.solde.toString(),
                methodePaiement: 'Espèces',
                referenceExterne: `CORRECTION-${Date.now()}`,
                observations: `Correction manuelle de solde par ${req.session.user?.username || 'Admin'}`,
                createdBy: req.session.user?.id
            });
        }

        // 3. Update account
        const updatedAccount = await storage.updateClientAccount(accountId, {
          typeCompte: parsed.typeCompte,
          tauxInteret: parsed.tauxInteret?.toString(),
          statut: parsed.statut,
          // If solde was provided, it's now backed by a transaction, so we can update it in the account record too
          ...(parsed.solde !== undefined ? { solde: parsed.solde.toString() } : {})
        });

        if (!updatedAccount) {
            return res.status(404).json({ message: "Compte introuvable" });
        }

        // 4. Log Audit
        await logAudit(
            req,
            "UPDATE_ACCOUNT",
            "client",
            client.id,
            { accountId, updates: parsed },
            "success",
            "medium"
        );

        // 5. Notify Real-Time Updates
        const wsServer = await import("../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            // Notify client update (force refresh of client details everywhere)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: client.id, agenceId: client.agenceId } });
            
            // Notify live activity
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Modification compte ${updatedAccount.numeroCompte}`,
                user: req.session.user?.nom || 'Système',
                type: 'finance',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId
              }
            });

             // Update dashboard stats if there was an invalidation needed
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
        }

        res.json(updatedAccount);
      } catch (error) {
         if (error instanceof z.ZodError) return res.status(400).json(error);
         console.error("Error updating account:", error);
         res.status(500).json({ message: "Erreur mise à jour compte" });
      }
  });

  // CREATE: Validation de l'agence cible (supporte agenceId)
  app.post("/api/clients", requireAuth, requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);

        // Validate documents array separately for better error messages
        let validatedDocuments: ClientDocument[] | undefined = undefined;
        if (data.documents && Array.isArray(data.documents)) {
          const docsResult = clientDocumentsArraySchema.safeParse(data.documents);
          if (!docsResult.success) {
            console.warn("Documents validation failed:", docsResult.error);
            // Still allow creation, just log the validation issue
          } else {
            validatedDocuments = docsResult.data;
          }

          // Verify that private documents use secure-docs bucket keys
          if (validatedDocuments) {
            validatedDocuments = validatedDocuments.map(doc => {
              // Ensure private docs have proper path format (not full URLs)
              if (doc.isPrivate && doc.documentUrl.startsWith('http')) {
                console.warn(`Document ${doc.documentType} has full URL for private doc, should be object key`);
              }
              return doc;
            });
          }
        }

        const parsed = insertClientSchema.parse(data);

        // Use validated documents if available, otherwise use parsed
        const clientData = validatedDocuments
          ? { ...parsed, documents: validatedDocuments }
          : parsed;

        // L'agenceId a été validée/forcée par validateAgenceIdAction
        // Si elle manquait, validateAgenceIdAction l'a ajoutée depuis req.selectedAgenceId

        const client = await storage.createClient(clientData);

        // 🏦 Auto-création d'un compte courant pour chaque nouveau client
        // Règle microfinance : tout client doit avoir un compte courant dans son agence
        let compteCourant = null;
        try {
          compteCourant = await createClientAccount(client.id, {
            typeCompte: 'Courant',
            soldeInitial: 0,
            tauxInteret: 0,
            statut: 'Actif',
            agenceId: client.agenceId
          }, req.session.user?.id);
          console.log(`✅ Compte courant ${compteCourant.numeroCompte} créé automatiquement pour le client ${client.nom}`);
        } catch (accountError) {
          console.error(`⚠️ Échec création compte courant auto pour client ${client.id}:`, accountError);
          // Ne pas bloquer la création du client si le compte échoue
        }

        // Fetch agency details to return complete object (Item 21 fix)
        let agenceNom = client.agence; // Fallback to legacy field
        if (client.agenceId) {
            const [agence] = await db.select().from(agences).where(eq(agences.id, client.agenceId));
            if (agence) agenceNom = agence.nom;
        }

        await logAudit(
            req,
            "CREATE_CLIENT",
            "client",
            client.id,
            undefined,
            "success",
            "low"
        );

        // Update Dashboard & Lists via WebSocket
        const wsServer = await import("../ws-server"); // Dynamic import for ESM
        const wsInstance = wsServer.getWsInstance();

        if (wsInstance) {
            // Notifier dashboard global (stats)
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });

            // Notifier liste clients (filtrée côté client)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client.agenceId, agence: client.agence } });

            // Activité en temps réel
            const accountInfo = compteCourant ? ` + Compte ${compteCourant.numeroCompte}` : '';
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Nouveau client: ${client.nom}${client.prenom ? ' ' + client.prenom : ''}${accountInfo}`,
                user: req.session.user?.nom || 'Système',
                type: 'client',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId // Pour filtrage côté client
              }
            });
        }

        res.status(201).json(addSnakeCaseAliasesDeep({
            ...client,
            agence_nom: agenceNom,
            type_marche_nom: 'Standard' // Default for now, or fetch if needed
        }));
      } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json(e);
        console.error("Create client error:", e);
        res.status(500).json({ message: "Create client failed" });
      }
  });

  // UPDATE: Vérification accès + interdiction changer agence (roles: admin, chef, caisse, terrain, credit)
  app.patch("/api/clients/:id", requireAuth, requireRole('admin', 'chef', 'caisse', 'terrain', 'credit'), requireAgenceIdAccess(), async (req, res) => {
      try {
        const existing = await storage.getClient(req.params.id);
        if (!existing) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && existing.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          } else if (agenceFilter.agence && existing.agence !== agenceFilter.agence) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          }
        }

        const data = normalizeKeysDeep(req.body);

        // Validate documents array if provided
        let validatedDocuments: ClientDocument[] | undefined = undefined;
        if (data.documents && Array.isArray(data.documents)) {
          const docsResult = clientDocumentsArraySchema.safeParse(data.documents);
          if (docsResult.success) {
            validatedDocuments = docsResult.data;
          }
        }

        const parsed = insertClientSchema.partial().parse(data);

        // Merge validated documents
        const updateData = validatedDocuments !== undefined
          ? { ...parsed, documents: validatedDocuments }
          : parsed;

        // Empêcher changement d'agence si non admin
        if (agenceFilter) {
          if (updateData.agenceId && updateData.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Impossible de changer l'agence du client" });
          }
          if (updateData.agence && agenceFilter.agence && updateData.agence !== agenceFilter.agence) {
            return res.status(403).json({ message: "Impossible de changer l'agence du client" });
          }
        }

        // Check for file replacement and cleanup old file
        if (updateData.photoProfile && existing.photoProfile && updateData.photoProfile !== existing.photoProfile) {
             // If old photo was a URL (not base64), delete it
             if (!existing.photoProfile.startsWith('data:')) {
                 StorageService.deleteFileFromUrl(existing.photoProfile).catch((e: any) =>
                    console.error("Failed to delete old profile photo:", e)
                 );
             }
        }

        const client = await storage.updateClient(req.params.id, updateData);

        // ====== BUSINESS LOGIC: Account Freezing on Client Status Change ======
        const INACTIVE_STATUSES = ['Inactif', 'Suspendu', 'Blacklisté'];
        const wasActive = !INACTIVE_STATUSES.includes(existing.status || '');
        const isNowInactive = INACTIVE_STATUSES.includes(client?.status || '');
        
        if (wasActive && isNowInactive && client) {
            // Freeze all client accounts
            const accounts = await getComptesByClient(client.id);
            for (const account of accounts) {
                if (account.statut === 'Actif' && !account.blocageActif) {
                    await storage.updateCompte(account.id, {
                        blocageActif: true,
                        blocageMotif: 'Décision interne',
                        blocageReference: `CLIENT_STATUS:${client.status}`,
                        blocageDebut: new Date()
                    });
                }
            }
            console.log(`🔒 Frozen ${accounts.length} accounts for client ${client.id} (status: ${client.status})`);
        }
        // ====== END BUSINESS LOGIC ======

        await logAudit(
            req,
            "UPDATE_CLIENT",
            "client",
            client!.id,
            undefined,
            "success",
            "low"
        );

        // Update Lists
        // Update Lists
        const wsServer = await import("../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client!.agenceId } });
        }

        res.json(addSnakeCaseAliasesDeep(client));
      } catch (e) {
          console.error("Update client error:", e);
          res.status(500).json({ message: "Update failed" });
      }
  });

  // DELETE: Vérification accès (roles: admin, chef only)
  app.delete("/api/clients/:id", requireAuth, requireRole('admin', 'chef'), requireAgenceIdAccess(), async (req, res) => {
      const existing = await storage.getClient(req.params.id);
      if (!existing) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter) {
        if (agenceFilter.agenceId && existing.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        } else if (agenceFilter.agence && existing.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      const success = await storage.deleteClient(req.params.id);

      await logAudit(
            req,
            "DELETE_CLIENT",
            "client",
            req.params.id,
            undefined,
            "success",
            "low"
      );

      // Update Lists
      // Update Lists
      const wsServer = await import("../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: existing.agenceId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.status(200).json({ message: "Client deleted successfully" });
  });


  // Check Uniqueness
  app.post("/api/clients/check-uniqueness", requireAuth, async (req, res) => {
      try {
          const { telephone, email, numeroPiece, excludeClientId } = req.body;
          
          console.log('[DEBUG_V2] Params:', { 
            phone: telephone, 
            piece: numeroPiece, 
            excludeId: excludeClientId, 
            excludeType: typeof excludeClientId 
          });

          const cleanPhone = telephone?.trim();
          const cleanEmail = email?.trim();
          const cleanPiece = numeroPiece?.trim();

          const checks = [];
          if (cleanPhone) checks.push(eq(clients.telephone, cleanPhone));
          if (cleanEmail) checks.push(eq(clients.email, cleanEmail));
          if (cleanPiece) checks.push(eq(clients.numeroPiece, cleanPiece));

          if (checks.length === 0) return res.json({ available: true });

          let query = db.select().from(clients).where(or(...checks));
          
          const conflicts = await query;
          console.log('[DEBUG_V2] Raw Conflicts:', conflicts.map(c => ({ 
              id: c.id, 
              idType: typeof c.id, 
              nom: c.nom, 
              piece: c.numeroPiece 
          })));
          
          // Filter out - using very explicit comparison logging
          const realConflicts = conflicts.filter(c => {
             if (!excludeClientId) return true;
             
             const isSame = String(c.id) === String(excludeClientId);
             console.log(`[DEBUG_V2] Comparing DB ID "${c.id}" vs Exclude "${excludeClientId}" => isSame? ${isSame}`);
             
             return !isSame;
          });
          
          console.log('[DEBUG_V2] Final Conflicts:', realConflicts.length);
          

          if (realConflicts.length > 0) {
              const conflict = realConflicts[0];
              let field = '';
              if (telephone && conflict.telephone === telephone) field = 'telephone';
              else if (email && conflict.email === email) field = 'email';
              else if (numeroPiece && conflict.numeroPiece === numeroPiece) field = 'numeroPiece';
              
              return res.json({ 
                  available: false, 
                  field, 
                  message: `Ce ${field === 'numeroPiece' ? 'numéro de pièce' : field} est déjà associé à ${conflict.nom} ${conflict.prenom || ''}` 
              });
          }

          res.json({ available: true });
      } catch (error) {
          console.error("Uniqueness check error:", error);
          res.status(500).json({ message: "Validation error" });
      }
  });

  // Types de Marchés
  app.get("/api/types-marches", requireAuth, async (req, res) => {
      const types = await getAllTypesMarches();
      res.json(types);
  });

  // Client Tags
  app.get("/api/clients/:id/tags", requireAuth, async (req, res) => {
      // TODO: Vérifier accès client
      const tags = await getClientTags(req.params.id);
      res.json(tags);
  });

  app.post("/api/clients/:id/tags", requireAuth, async (req, res) => {
     // TODO: Vérifier accès client
     const ct = await addClientTag({ ...req.body, clientId: req.params.id });
     res.json(ct);
  });

  app.delete("/api/clients/:id/tags/:tagId", requireAuth, async (req, res) => {
     // TODO: Vérifier accès client
     await removeClientTag(req.params.id, req.params.tagId);
     res.sendStatus(200);
  });

  // Tags global
  app.get("/api/tags", requireAuth, async (req, res) => {
      const tags = await getAllTags();
      res.json(tags);
  });

  app.post("/api/tags", requireAuth, async (req, res) => {
      const tag = await createTag(req.body);
      res.json(tag);
  });

  // Client Activities
  app.get("/api/clients/:id/activities", requireAuth, async (req, res) => {
      // TODO: Vérifier accès client
      const acts = await getClientActivities(req.params.id);
      res.json(acts);
  });

  app.post("/api/clients/:id/activities", requireAuth, async (req, res) => {
      // TODO: Vérifier accès client
      const act = await logClientActivity({ ...req.body, clientId: req.params.id, userId: req.session.user!.id });
      res.json(act);
  });

  // Calculate Score
  app.post("/api/clients/:id/score", requireAuth, async (req, res) => {
      try {
        const result = await calculateClientScore(req.params.id);

        // Notify update
        const wsModule = await import("../ws-server");
        const wsInstance = wsModule.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: req.params.id } });
        }

        res.json(result);
      } catch (error) {
          console.error("Score calculation error:", error);
          res.status(500).json({ message: "Score calculation failed" });
      }
  });

  // Analytics Real-Time
  app.get("/api/clients/:id/analytics", requireAuth, async (req, res) => {
      try {
        const clientId = req.params.id;
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });

        // 1. Fetch all financial data in parallel
        const [accounts, credits, membresTontineData, transactionsMonth] = await Promise.all([
            getComptesByClient(clientId),
            getCreditsByClient(clientId),
            db.select().from(membresTontine).where(eq(membresTontine.clientId, clientId)),
            storage.getMouvementsByClientAndDateRange(
                clientId, 
                new Date(new Date().getFullYear(), new Date().getMonth(), 1), 
                new Date()
            )
        ]);

        // 2. Aggregate Data
        
        // Savings (Courant + Epargne + Tontine Contributions)
        const compteCourantTotal = accounts
            .filter(a => a.typeCompte === 'Courant' && a.statut === 'Actif')
            .reduce((sum, a) => sum + Number(a.soldeCourant), 0);
            
        const compteEpargneTotal = accounts
            .filter(a => a.typeCompte === 'Épargne' && a.statut === 'Actif')
            .reduce((sum, a) => sum + Number(a.soldeCourant), 0);

        const tontineContributionTotal = membresTontineData
            .filter(m => m.statut === 'Actif')
            .reduce((sum, m) => sum + Number(m.totalCotisations), 0);

        const totalSavings = compteCourantTotal + compteEpargneTotal + tontineContributionTotal;

        // Credits (Active Due)
        const activeCredits = credits.filter(c => ['Actif', 'En retard', 'En cours'].includes(c.statut));
        const totalCreditDue = activeCredits.reduce((sum, c) => sum + Number(c.soldeRestant), 0);

        // 3. Trends (Growth this month)
        // Simple logic: Sum of "Dépôt" operations this month vs "Retrait"
        const depositsMonth = transactionsMonth
            .filter(t => t.sens === 'Crédit')
            .reduce((sum, t) => sum + Number(t.montant), 0);
            
        // Calculate newly requested counters
        const savingsAccountsCount = accounts.filter(a => 
            ['Épargne', 'Compte Bloqué', 'Terme'].includes(a.typeCompte) && a.statut === 'Actif'
        ).length;

        const activeTontinesCount = membresTontineData.filter(m => m.statut === 'Actif').length;

        // 4. Construct Response
        const response = {
            summary: {
                total_savings: totalSavings,
                total_credit_due: totalCreditDue,
                active_loans_count: activeCredits.length,
                savings_accounts_count: savingsAccountsCount,
                active_tontines_count: activeTontinesCount,
                fidelity_points: client.pointsFidelite || 0,
                repayment_rate: Number(client.tauxRemboursement) || 0
            },
            distribution: [
                { label: "Compte Courant", value: compteCourantTotal, color: "#10B981" }, // Emerald 500
                { label: "Épargne", value: compteEpargneTotal, color: "#3B82F6" },      // Blue 500
                { label: "Tontine", value: tontineContributionTotal, color: "#F59E0B" } // Amber 500
            ].filter(d => d.value > 0), // Only show non-zero segments
            monthly_trend: {
                savings_growth: depositsMonth > 0 ? `+${(depositsMonth / (totalSavings || 1) * 100).toFixed(1)}%` : "0%",
                credit_evolution: "0%" // Placeholder for now
            }
        };

        res.json(response);
      } catch (error) {
          console.error("Analytics error:", error);
          res.status(500).json({ message: "Failed to generate analytics" });
      }
  });

  // ============================================
  // NOUVELLES ROUTES POUR ARCHITECTURE users/clients
  // ============================================

  // GET - Récupérer un client par son userId
  app.get("/api/clients/by-user/:userId", requireAuth, async (req, res) => {
    try {
      const client = await getClientByUserId(req.params.userId);
      if (!client) {
        return res.status(404).json({ message: "Aucun profil client pour cet utilisateur" });
      }
      res.json(addSnakeCaseAliasesDeep(client));
    } catch (error) {
      console.error("Error fetching client by userId:", error);
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });

  // GET - Client avec données utilisateur
  app.get("/api/clients/:id/with-user", requireAuth, async (req, res) => {
    try {
      const client = await getClientWithUser(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client non trouvé" });
      }
      res.json(addSnakeCaseAliasesDeep(client));
    } catch (error) {
      console.error("Error fetching client with user:", error);
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });

  // POST - Créer un client avec un compte utilisateur (pour futur portail client)
  app.post("/api/clients/with-user", requireRole("admin", "chef"), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientWithUser } = await import("../storage/clients");

      const schema = z.object({
        // Données utilisateur
        nom: z.string().min(1, "Le nom est requis"),
        prenom: z.string().optional(),
        email: z.string().email().optional().nullable(),
        telephone: z.string().optional().nullable(),
        sexe: z.enum(['M', 'F']).optional().nullable(),
        username: z.string().optional().nullable(),
        password: z.string().optional().nullable(),
        // Données client métier
        adresse: z.string().optional(),
        ville: z.string().optional(),
        pays: z.string().optional(),
        profession: z.string().optional(),
        segment: z.string().optional(),
        agenceId: z.string().uuid().optional().nullable(),
        agence: z.string().optional(), // Legacy
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const data = parsed.data;

      // Vérifier si username existe déjà
      if (data.username) {
        const existingUser = await storage.getUserByUsername(data.username);
        if (existingUser) {
          return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
        }
      }

      // Hasher le mot de passe si fourni
      let hashedPassword = null;
      if (data.password) {
        hashedPassword = await hashPassword(data.password);
      }

      const userData = {
        nom: data.nom,
        prenom: data.prenom,
        email: data.email || undefined,
        telephone: data.telephone || undefined,
        sexe: data.sexe as 'M' | 'F' | undefined,
        username: data.username || undefined,
        password: hashedPassword || undefined,
      };

      const clientData = {
        adresse: data.adresse,
        ville: data.ville,
        pays: data.pays,
        profession: data.profession,
        segment: data.segment || 'Standard',
        agenceId: data.agenceId || (req as any).selectedAgenceId,
        agence: data.agence,
        creditTotal: '0',
        epargneTotal: '0',
        tauxRemboursement: '100',
        dateInscription: new Date(),
      };

      const result = await createClientWithUser(userData, clientData);

      await logAudit(
        req,
        "CREATE_CLIENT_WITH_USER",
        "client",
        result.client.id,
        { nom: data.nom, hasPortalAccess: !!data.username },
        "success",
        "medium"
      );

      res.status(201).json(addSnakeCaseAliasesDeep(result));

    } catch (error) {
      console.error("Error creating client with user:", error);
      res.status(500).json({ message: "Erreur lors de la création du client" });
    }
  });

  // POST - Créer un profil client pour un utilisateur existant
  app.post("/api/clients/from-user/:userId", requireRole("admin", "chef"), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientForUser } = await import("../storage/clients");
      const { userId } = req.params;

      // Vérifier que l'utilisateur existe
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Vérifier qu'il n'a pas déjà un profil client
      const existingClient = await getClientByUserId(userId);
      if (existingClient) {
        return res.status(400).json({ message: "Cet utilisateur a déjà un profil client" });
      }

      const data = normalizeKeysDeep(req.body);
      const parsed = insertClientSchema.omit({ userId: true, nom: true }).safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      // Forcer l'agenceId si non fournie
      const clientData = {
        ...parsed.data,
        agenceId: parsed.data.agenceId || (req as any).selectedAgenceId,
      };

      const client = await createClientForUser(userId, clientData);

      await logAudit(
        req,
        "CREATE_CLIENT_FROM_USER",
        "client",
        client.id,
        { userId },
        "success",
        "medium"
      );

      res.status(201).json(addSnakeCaseAliasesDeep(client));

    } catch (error) {
      console.error("Error creating client from user:", error);
      res.status(500).json({ message: "Erreur lors de la création du profil client" });
    }
  });

  // ============================================
  // GLOBAL HISTORY ENDPOINT
  // ============================================
  app.get("/api/clients/:id/global-history", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
        const clientId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        
        // Verify access to client
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé" });
          }
        }

        // Fetch from mouvementsFinanciers (the source of truth)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        

        
        // Get all movements for this client
        const movements = await db.select()
            .from(mouvementsFinanciers)
            .where(and(
                eq(mouvementsFinanciers.clientId, clientId),
                gte(mouvementsFinanciers.dateOperation, oneYearAgo)
            ))
            .orderBy(desc(mouvementsFinanciers.dateOperation))
            .limit(limit)
            .offset((page - 1) * limit);

        // Transform to unified history format
        const history = movements.map((m: any) => ({
            id: m.id,
            date: m.dateOperation,
            type: m.typePaiement || m.sourceModule,
            sens: m.sens, // 'Débit' or 'Crédit'
            montant: Number(m.montant),
            source_module: m.sourceModule,
            reference: m.reference,
            reference_externe: m.referenceExterne,
            statut: m.statut,
            // Icon mapping for frontend
            icon: getTransactionIcon(m.sourceModule, m.typePaiement)
        }));

        // Count total for pagination
        const [countResult] = await db.select({ count: sql`count(*)` })
            .from(mouvementsFinanciers)
            .where(and(
                eq(mouvementsFinanciers.clientId, clientId),
                gte(mouvementsFinanciers.dateOperation, oneYearAgo)
            ));
        
        const total = Number(countResult?.count) || 0;

        res.json({
            data: history,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Global history error:", error);
        res.status(500).json({ message: "Erreur lors de la récupération de l'historique" });
    }
  });
}

// Helper function for icon mapping
function getTransactionIcon(sourceModule: string, typePaiement?: string): string {
    const type = (typePaiement || sourceModule || '').toLowerCase();
    if (type.includes('crédit') || type.includes('credit')) return 'credit-card';
    if (type.includes('épargne') || type.includes('epargne')) return 'piggy-bank';
    if (type.includes('tontine')) return 'users';
    if (type.includes('retrait')) return 'arrow-up-right';
    if (type.includes('dépôt') || type.includes('depot') || type.includes('versement')) return 'arrow-down-left';
    if (type.includes('remboursement')) return 'refresh-cw';
    if (type.includes('décaissement') || type.includes('decaissement')) return 'banknote';
    return 'activity';
}
