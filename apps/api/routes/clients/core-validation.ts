import type { Express } from "express";

import { clients, users } from "@shared/schema";
import { normalizePhone } from "@shared/utils/phone";
import { and, eq, or, sql } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Clients:Validation');

/**
 * Routes de validation et vérification d'unicité des clients.
 *
 * - POST /api/clients/check-uniqueness — Vérifie les doublons (téléphone, email, nom, pièce)
 */
export function registerClientValidationRoutes(app: Express) {

  // Vérification d'unicité
  // Architecture V3 : telephone/email sont dans users, numeroPiece dans clients
  app.post("/api/clients/check-uniqueness", requireAuth, async (req, res) => {
      try {
          const { telephone, email, numeroPiece, nom, prenom, excludeClientId } = req.body;

          logger.debug({ phone: telephone, piece: numeroPiece, nom, prenom, excludeId: excludeClientId }, 'Paramètres de vérification d\'unicité');

          const cleanPhone = normalizePhone(telephone) || telephone?.trim();
          const cleanEmail = email?.trim();
          const cleanPiece = numeroPiece?.trim();
          const cleanNom = nom?.trim();
          const cleanPrenom = prenom?.trim();

          // Construire les conditions — telephone/email/nom+prenom dans la table users, numeroPiece dans clients
          const userChecks = [];
          if (cleanPhone) userChecks.push(eq(users.telephone, cleanPhone));
          if (cleanEmail) userChecks.push(eq(users.email, cleanEmail));

          // Vérification combo nom + prénom (insensible à la casse)
          if (cleanNom && cleanPrenom) {
            userChecks.push(
              and(
                sql`lower(${users.nom}) = lower(${cleanNom})`,
                sql`lower(${users.prenom}) = lower(${cleanPrenom})`,
              )!
            );
          }

          const clientChecks = [];
          if (cleanPiece) clientChecks.push(eq(clients.numeroPiece, cleanPiece));

          if (userChecks.length === 0 && clientChecks.length === 0) {
            return res.json({ available: true });
          }

          // Requête : clients JOIN users, vérification de toutes les conditions
          const allChecks = [...userChecks, ...clientChecks];

          const conflicts = await db
            .select({
              id: clients.id,
              numeroPiece: clients.numeroPiece,
              nom: users.nom,
              prenom: users.prenom,
              telephone: users.telephone,
              email: users.email,
            })
            .from(clients)
            .leftJoin(users, eq(clients.userId, users.id))
            .where(or(...allChecks));

          // Exclure le client en cours de modification
          const realConflicts = conflicts.filter(c => {
             if (!excludeClientId) return true;
             return String(c.id) !== String(excludeClientId);
          });

          if (realConflicts.length > 0) {
              const conflict = realConflicts[0];
              let field = '';
              const conflictDisplay = `${conflict.nom} ${conflict.prenom || ''}`.trim();

              // Déterminer quel champ a causé le conflit (priorité : nom > téléphone > email > pièce)
              if (cleanNom && cleanPrenom
                  && conflict.nom?.toLowerCase() === cleanNom.toLowerCase()
                  && conflict.prenom?.toLowerCase() === cleanPrenom.toLowerCase()) {
                field = 'nom';
              } else if (cleanPhone && conflict.telephone === cleanPhone) {
                field = 'telephone';
              } else if (cleanEmail && conflict.email?.toLowerCase() === cleanEmail.toLowerCase()) {
                field = 'email';
              } else if (cleanPiece && conflict.numeroPiece === cleanPiece) {
                field = 'numeroPiece';
              }

              const labels: Record<string, string> = {
                nom: 'Ce nom et prénom sont',
                telephone: 'Ce téléphone est',
                email: 'Cet email est',
                numeroPiece: 'Ce numéro de pièce est',
              };

              return res.json({
                  available: false,
                  field,
                  message: `${labels[field] || 'Cette valeur est'} déjà associé(e) au client ${conflictDisplay}`
              });
          }

          res.json({ available: true });
      } catch (error) {
          logger.error({ err: error }, 'Erreur de vérification d\'unicité');
          res.status(500).json({ message: "Validation error" });
      }
  });
}
