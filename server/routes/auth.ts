import type { Express } from "express";
import { insertUserSchema, users, userPermissions, modules, permissions, userAgences, agences, userRoles, employes } from "@shared/schema";
import { SystemRole, isAdminRole, normalizeRole } from "@shared/types/roles";
import { storage } from "../storage";
import { loginUser, registerUser, requireAuth, hashPassword, comparePasswords } from "../auth";
import { attachAbility, requireAbility, requireResetPassword } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit, logLoginAttempt, getLoginLockoutInfo, validatePassword, getPasswordRequirements, getAuditLogs, clearLoginAttemptsOnSuccess, purgeOldAuditLogs, getAuditLogStats } from "../audit";
import { createSessionRecord, deleteSessionRecord, deleteUserSessions, getActiveSessions, isSessionValid, markSessionInactive, markUserSessionsInactive, sessionGuard } from "../session-tracker";
import { getPermissionsForUser } from "../services/permissions-service";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import { StatutUser } from "@shared/enum/status-constants";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import { StorageService } from "../services/storage-service";

/**
 * Récupérer le caissePin d'un utilisateur depuis la table employes.
 * Architecture V3: caissePin est stocké dans employes, pas users.
 */
async function getUserCaissePin(userId: string): Promise<string | null> {
  const [employe] = await db.select({ caissePin: employes.caissePin })
    .from(employes)
    .where(eq(employes.userId, userId));
  return employe?.caissePin || null;
}

/**
 * Mettre à jour le caissePin d'un utilisateur dans la table employes.
 */
async function setUserCaissePin(userId: string, hashedPin: string): Promise<void> {
  await db.update(employes)
    .set({ caissePin: hashedPin, updatedAt: new Date() })
    .where(eq(employes.userId, userId));
}

/**
 * Récupère le rôle effectif d'un utilisateur.
 *
 * Architecture V3 - Source unique: userRoles
 * 1. Rôle principal (isPrimary = true)
 * 2. Premier rôle disponible (par date de création)
 * 3. CLIENT (fallback par défaut)
 *
 * @param userId - ID de l'utilisateur
 * @param agenceId - (optionnel) Si fourni, cherche un rôle scopé à cette agence
 * @returns Le rôle effectif de l'utilisateur
 */
async function getEffectiveRole(userId: string, agenceId?: string): Promise<SystemRole> {
  // 1. Chercher le rôle principal
  const [primaryRole] = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(
      agenceId
        ? and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true), eq(userRoles.agenceId, agenceId))
        : and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true))
    )
    .limit(1);

  if (primaryRole?.role) {
    return primaryRole.role as SystemRole;
  }

  // 2. Si pas de rôle principal, prendre le premier rôle disponible
  const [anyRole] = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(userRoles.createdAt))
    .limit(1);

  if (anyRole?.role) {
    return anyRole.role as SystemRole;
  }

  // 3. Fallback: CLIENT
  return SystemRole.CLIENT;
}

/**
 * Récupère tous les rôles d'un utilisateur (pour l'architecture multi-rôles)
 * @param userId - ID de l'utilisateur
 * @returns Liste des rôles avec leur scope agence
 */
async function getUserRoles(userId: string): Promise<Array<{ role: SystemRole; agenceId: string | null; isPrimary: boolean }>> {
  const roles = await db.select({
    role: userRoles.role,
    agenceId: userRoles.agenceId,
    isPrimary: userRoles.isPrimary,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId));

  return roles.map(r => ({
    role: r.role as SystemRole,
    agenceId: r.agenceId,
    isPrimary: r.isPrimary,
  }));
}

const normalizeUserPayload = (payload: any) => {
  if (!payload || typeof payload !== "object") return payload;
  const data: any = { ...payload };

  if (typeof data.name === "string" && data.name.trim()) {
    const parts = data.name.trim().split(/\s+/).filter(Boolean);
    if (!data.prenom && parts.length > 0) {
      data.prenom = parts[0];
    }
    if (!data.nom && parts.length > 1) {
      data.nom = parts.slice(1).join(" ");
    }
    if (!data.nom && parts.length === 1) {
      data.nom = parts[0];
    }
  }

  if (typeof data.phone === "string" && !data.telephone) {
    data.telephone = data.phone;
  }

  if (typeof data.photo_profile === "string" && !data.photoProfile) {
    data.photoProfile = data.photo_profile;
  }

  delete data.name;
  delete data.phone;
  delete data.photo_profile;

  return data;
};

async function resolvePrimaryAgence(userId: string): Promise<{ agenceId: string; agenceNom: string | null } | null> {
  const [primaryAgence] = await db
    .select({
      agenceId: userAgences.agenceId,
      agenceNom: agences.nom,
    })
    .from(userAgences)
    .leftJoin(agences, eq(userAgences.agenceId, agences.id))
    .where(and(
      eq(userAgences.userId, userId),
      eq(userAgences.isPrimary, true),
      eq(userAgences.actif, true)
    ))
    .limit(1);

  if (primaryAgence) {
    return primaryAgence;
  }

  const [anyAgence] = await db
    .select({
      agenceId: userAgences.agenceId,
      agenceNom: agences.nom,
    })
    .from(userAgences)
    .leftJoin(agences, eq(userAgences.agenceId, agences.id))
    .where(and(
      eq(userAgences.userId, userId),
      eq(userAgences.actif, true)
    ))
    .limit(1);

  return anyAgence || null;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const lockoutInfo = await getLoginLockoutInfo(username);

      if (lockoutInfo.locked) {
        await logLoginAttempt(username, req, false, "account_locked");
        return res.status(403).json({
          message: "Compte verrouillé suite à trop de tentatives échouées.",
          locked: true,
          retryAfterSeconds: lockoutInfo.retryAfterSeconds,
          lockedUntil: lockoutInfo.lockedUntil,
        });
      }

      const user = await loginUser(username, password);

      if (!user) {
        await logLoginAttempt(username, req, false, "invalid_credentials");
        // Recalculer après enregistrement de la tentative
        const updatedInfo = await getLoginLockoutInfo(username);
        return res.status(401).json({
          message: "Identifiant ou mot de passe incorrect",
          remainingAttempts: updatedInfo.remainingAttempts,
          ...(updatedInfo.locked ? {
            locked: true,
            retryAfterSeconds: updatedInfo.retryAfterSeconds,
            lockedUntil: updatedInfo.lockedUntil,
          } : {}),
        });
      }

      if (user.statut !== StatutUser.ACTIVE) {
        await logLoginAttempt(username, req, false, "account_disabled");
        return res.status(403).json({ message: "Compte désactivé. Contactez un administrateur." });
      }

      // Success
      await clearLoginAttemptsOnSuccess(username);
      await logLoginAttempt(username, req, true);
      
      const primaryAgence = await resolvePrimaryAgence(user.id);

      // Notify Admins
      // Notify Admins
      try {
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
           wsInstance.broadcast({
              type: "NOTIFICATION",
              payload: {
                 message: `Connexion: ${username}`,
                 targetRole: SystemRole.ADMIN
              }
           });
           wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
           
           // Activité en temps réel
           wsInstance.broadcast({
             type: "LIVE_ACTIVITY",
             payload: {
               action: `Connexion: ${user.prenom || ''} ${user.nom}`.trim(),
               user: primaryAgence?.agenceNom || 'Siège',
               type: 'login',
               timestamp: new Date().toISOString()
             }
           });
        }
      } catch (e) {
        console.error("Failed to fallback to WS notification:", e);
      }
      
      // Récupérer le rôle effectif depuis userRoles (Architecture V3)
      const effectiveRole = await getEffectiveRole(user.id, primaryAgence?.agenceId);

      req.session.userId = user.id;
      req.session.user = {
          id: user.id,
          username: user.username || user.nom,
          nom: user.nom,
          prenom: user.prenom,
          role: effectiveRole,
          agence: primaryAgence?.agenceNom || null,
          agenceId: primaryAgence?.agenceId,
          email: user.email || undefined,
          telephone: user.telephone || undefined,
          mustChangePassword: user.mustChangePassword || false
      };

      // Save session and wait for it to complete before responding
      try {
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      } catch (sessionErr) {
        // Log but don't fail the login - session might still work
        console.error("Warning: Session save failed, but continuing login:", sessionErr);
      }

      // Create session tracking record with session expiry (24h from now)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await createSessionRecord(req.sessionID, user.id, req, expiresAt);

      // Log successful login in audit
      await logAudit(
        req,
        "LOGIN",
        "auth",
        user.id,
        { ip: req.ip, userAgent: req.headers['user-agent'] },
        "success",
        "low"
      );

      // Charger les permissions pour inclure dans la réponse (évite race condition)
      const permissionsData = await getPermissionsForUser(user.id, effectiveRole);

      res.json({
        user: req.session.user,
        message: "Login successful",
        mustChangePassword: user.mustChangePassword || false,
        permissions: permissionsData // Inclus pour éviter un second appel API
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error during login" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.sessionID;
    const userId = req.session.user?.id;

    if (req.session.user) {
      await logAudit(
        req,
        "LOGOUT",
        "auth",
        req.session.user.id,
        undefined,
        "success",
        "low"
      );
    }

    // Delete from active_sessions table
    if (sessionId) {
      await deleteSessionRecord(sessionId);
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    // Validate session is still active in database
    const validity = await isSessionValid(req.sessionID);
    if (!validity.valid) {
      console.log(`[AUTH] Session ${req.sessionID} invalid: ${validity.reason}`);

      // Destroy the session
      req.session.destroy((err) => {
        if (err) console.error('[AUTH] Error destroying invalid session:', err);
      });

      return res.status(401).json({
        message: 'Session expired or invalidated',
        code: 'SESSION_INVALID',
        reason: validity.reason
      });
    }

    // Auto-repair session if agenceId is missing
    if (!req.session.user.agenceId) {
       try {
          const primaryAgence = await resolvePrimaryAgence(req.session.user.id);
          if (primaryAgence) {
            req.session.user.agenceId = primaryAgence.agenceId;
            req.session.user.agence = primaryAgence.agenceNom;
            await new Promise<void>((resolve) => req.session.save(() => resolve()));
          }
       } catch (e) {
         console.error("Session repair failed:", e);
       }
    }

    // Récupérer les données utilisateur pour les champs non présents en session
    let userData: { photoProfile?: string | null; telephone?: string | null; adresse?: string | null } = {};
    try {
      const user = await storage.getUser(req.session.user.id);
      if (user) {
        userData = {
          photoProfile: user.photoProfile,
          telephone: user.telephone,
          adresse: user.adresse,
        };
      }
    } catch {
      // Erreur lors de la récupération, on continue sans
    }

    // Enrichir avec les données employé si disponibles (incluant poste et département)
    let employeData: Record<string, any> | null = null;
    try {
      const employeBase = await storage.getEmployeByUserId(req.session.user.id);
      if (employeBase) {
        // Récupérer les données complètes avec poste et département
        const employeWithDetails = await storage.getEmployeWithUser(employeBase.id);
        if (employeWithDetails) {
          employeData = {
            matricule: employeWithDetails.matricule,
            jobPositionId: employeWithDetails.jobPositionId,
            dateEmbauche: employeWithDetails.dateEmbauche,
            typeContrat: employeWithDetails.typeContrat,
            salaireBase: employeWithDetails.salaireBase,
            hasCaissePin: !!employeWithDetails.caissePin,
            agenceId: employeWithDetails.agenceId,
            // Données enrichies depuis les jointures
            jobPosition: employeWithDetails.jobPosition ? {
              id: employeWithDetails.jobPosition.id,
              code: employeWithDetails.jobPosition.code,
              name: employeWithDetails.jobPosition.name,
            } : null,
            department: employeWithDetails.department ? {
              id: employeWithDetails.department.id,
              code: employeWithDetails.department.code,
              name: employeWithDetails.department.name,
            } : null,
          };
        }
      }
    } catch {
      // Pas de données employé, c'est OK
    }

    res.json({
      ...req.session.user,
      ...userData,
      ...employeData,
      sessionValid: true // Explicit session validity indicator
    });
  });

  app.post("/api/auth/verify-pin", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN requis" });

      const userId = req.session.user!.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Session invalide. Veuillez vous reconnecter." });

      // Architecture V3: caissePin est dans employes, pas users
      const caissePin = await getUserCaissePin(userId);

      if (!caissePin) {
         return res.status(400).json({ error: "Aucun PIN configuré", requirePinSetup: true });
      }

      const isValid = await comparePasswords(pin, caissePin);

      if (!isValid) {
          return res.status(401).json({ error: "PIN incorrect" });
      }

      // Architecture V3: Rôle via getEffectiveRole
      const effectiveRole = await getEffectiveRole(userId);

      return res.json({
          id: user.id,
          username: user.username,
          name: `${user.prenom || ''} ${user.nom}`.trim(),
          role: effectiveRole,
          hasPinConfigured: true
      });

    } catch (e) {
      console.error("Error verifying PIN:", e);
      res.status(500).json({ error: "Erreur de vérification" });
    }
  });

  app.get("/api/user", requireAuth, async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    const user = await storage.getUser(req.session.user.id);
    res.json(user);
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const normalizedBody = normalizeUserPayload(req.body);
      const { nom, prenom, email, telephone, username, photoProfile, dateNaissance, adresse, ville } = normalizedBody;
      
      // If username is being changed, check for duplicates
      if (username && username !== user.username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== user.id) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      const updateData: any = {
        nom: nom || user.nom,
        prenom: prenom || user.prenom,
        email: email || user.email,
        telephone: telephone || user.telephone
      };

      // Add username if provided and changed
      if (username && username !== user.username) {
        updateData.username = username;
      }

      if (photoProfile !== undefined) {
        updateData.photoProfile = photoProfile;
      }

      // Nouveaux champs: dateNaissance, adresse, ville
      if (dateNaissance !== undefined) {
        updateData.dateNaissance = dateNaissance;
      }
      if (adresse !== undefined) {
        updateData.adresse = adresse;
      }
      if (ville !== undefined) {
        updateData.ville = ville;
      }
      
      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, user.id))
        .returning();

      // Update session
      if (updated && req.session.user) {
          req.session.user.nom = updated.nom;
          req.session.user.prenom = updated.prenom;
          req.session.user.email = updated.email || undefined;
          req.session.user.telephone = updated.telephone || undefined;
          if (updated.username) {
            req.session.user.username = updated.username;
          }
          await new Promise<void>((resolve) => req.session.save(() => resolve()));
      }

      // Log if username was changed
      if (username && username !== user.username) {
        await logAudit(
          req,
          "UPDATE_USERNAME",
          "user",
          user.id,
          { oldUsername: user.username, newUsername: username },
          "success",
          "high"
        );
      }

      res.json(updated);
    } catch (error) {
       res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await storage.getUser(req.session.user!.id);

    if (!user || !user.password || !(await comparePasswords(currentPassword, user.password))) {
      return res.status(400).json({ message: "Invalid current password" });
    }

    // Validate new password complexity
    const requirements = await getPasswordRequirements();
    const validation = validatePassword(newPassword, requirements);
    if (!validation.valid) {
        return res.status(400).json({ message: "Password does not meet requirements", details: validation.errors });
    }

    const hashedPassword = await hashPassword(newPassword);
    await db.update(users)
      .set({ 
        password: hashedPassword,
        mustChangePassword: false // Reset flag after password change
      })
      .where(eq(users.id, user.id));

    // Update session to reflect password change completion
    if (req.session.user) {
      req.session.user.mustChangePassword = false;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
    }

    await logAudit(
        req,
        "CHANGE_PASSWORD",
        "auth",
        user.id,
        undefined,
        "success",
        "high"
    );

    res.json({ message: "Password updated successfully" });
  });

  app.post("/api/auth/register", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    // Capture tempEntityId before schema parsing (insertUserSchema strips unknown fields)
    const tempEntityId = req.body?.tempEntityId || req.body?.temp_entity_id;

    try {
      const normalizedBody = normalizeUserPayload(req.body);

      // Validate complexity first
      if (normalizedBody.password) {
          const requirements = await getPasswordRequirements();
          const validation = validatePassword(normalizedBody.password, requirements);
          if (!validation.valid) return res.status(400).json(validation);
      }

      const parsed = insertUserSchema.safeParse(normalizedBody);
      if (!parsed.success) {
        return res.status(400).json(parsed.error);
      }

      if (!parsed.data.username) {
        return res.status(400).json({ message: "Username is required" });
      }

      const existingUser = await storage.getUserByUsername(parsed.data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await registerUser(parsed.data as any);

      // Relocate files from temp UUID to real user ID
      if (tempEntityId && tempEntityId !== user.id) {
        try {
          const keyMapping = await StorageService.relocateEntityFiles('user', tempEntityId, user.id);

          if (keyMapping.size > 0 && user.photoProfile && keyMapping.has(user.photoProfile)) {
            await db.update(users)
              .set({ photoProfile: keyMapping.get(user.photoProfile)! })
              .where(eq(users.id, user.id));
          }

          await StorageService.deleteEntityFiles('user', tempEntityId);
        } catch (relocateError) {
          console.error(`⚠️ File relocation failed for user ${user.id}:`, relocateError);
        }
      }

      // Architecture V3: Le rôle sera attribué via userRoles, pas dans user
      await logAudit(
        req,
        "CREATE_USER",
        "user",
        user.id,
        { username: user.username },
        "success",
        "medium"
      );

      res.status(201).json(user);
    } catch (error) {
      // Cleanup temp files if creation failed
      if (tempEntityId) {
        StorageService.deleteEntityFiles('user', tempEntityId)
          .catch(err => console.error("Cleanup temp files failed:", err));
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // User Management - REMOVED DUPLICATE (see consolidated handler below)

  app.get("/api/users", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    const allUsers = await storage.getAllUsers();

    // Architecture V3: Enrichir chaque utilisateur avec son rôle effectif depuis userRoles
    const usersWithRoles = await Promise.all(
      allUsers.map(async (user) => {
        const effectiveRole = await getEffectiveRole(user.id);
        return {
          ...user,
          role: effectiveRole
        };
      })
    );

    res.json(usersWithRoles);
  });

  app.get("/api/users/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Architecture V3: Enrichir avec le rôle effectif depuis userRoles
    const effectiveRole = await getEffectiveRole(user.id);
    res.json({
      ...user,
      role: effectiveRole
    });
  });

  app.patch("/api/users/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const userId = req.params.id;
      const updateData = normalizeUserPayload(req.body);

      // Extract role from payload - it's stored in userRoles, not users table
      const { role: newRole, ...userUpdateData } = updateData;

      // Update user data in users table (exclude role)
      const [updated] = await db.update(users).set(userUpdateData).where(eq(users.id, userId)).returning();

      // Handle role update in userRoles table
      if (newRole && updated) {
        // Check for existing primary role
        const [existingRole] = await db.select()
          .from(userRoles)
          .where(and(
            eq(userRoles.userId, userId),
            eq(userRoles.isPrimary, true)
          ));

        if (existingRole) {
          // Update existing primary role
          await db.update(userRoles)
            .set({ role: newRole, updatedAt: new Date() })
            .where(eq(userRoles.id, existingRole.id));
        } else {
          // Create new primary role
          await db.insert(userRoles).values({
            userId: userId,
            role: newRole,
            isPrimary: true,
          });
        }

        // Broadcast role change for real-time RBAC update
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "RBAC_UPDATE",
            payload: {
              entity: 'user_role',
              userId,
              role: newRole
            }
          });
          console.log(`🔄 RBAC: Broadcasted role change for user ${userId} -> ${newRole}`);
        }
      }

      if (updated) {
        await logAudit(
          req,
          "UPDATE_USER",
          "user",
          userId,
          updateData,
          "success",
          "medium"
        );

        // 🛡️ Kill Switch: Broadcast user status change for real-time logout
        if (userUpdateData.statut && userUpdateData.statut !== StatutUser.ACTIVE) {
          const { getWsInstance } = await import("../ws-server");
          const wsInstance = getWsInstance();
          if (wsInstance) {
            wsInstance.broadcast({
              type: "RBAC_UPDATE",
              payload: {
                entity: 'user_status',
                userId,
                status: userUpdateData.statut
              }
            });
            console.log(`🚨 SECURITY: Broadcasted user_status change for user ${userId} -> ${userUpdateData.statut}`);
          }
        }
      }

      // Return user with updated role
      const effectiveRole = await getEffectiveRole(userId);
      res.json({ ...updated, role: effectiveRole });
    } catch (e) {
      console.error("Update user failed:", e);
      res.status(500).json({ message: "Update failed" });
    }
  });

  app.delete("/api/users/:id", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.USER), async (req, res) => {
    try {
      const userId = req.params.id;
      const userToDelete = await storage.getUser(userId);

      await db.update(users)
        .set({ deletedAt: new Date(), statut: StatutUser.INACTIVE })
        .where(eq(users.id, userId));

      // Architecture V3: Rôle via userRoles (pas dans userToDelete)
      const deletedUserRole = userToDelete ? await getEffectiveRole(userToDelete.id) : null;

      await logAudit(
        req,
        "DELETE_USER",
        "user",
        userId,
        userToDelete ? {
          deletedUser: {
            id: userToDelete.id,
            username: userToDelete.username,
            email: userToDelete.email,
            nom: userToDelete.nom,
            prenom: userToDelete.prenom,
            role: deletedUserRole
          }
        } : undefined,
        "success",
        "high"
      );

      // 🛡️ Kill Switch: Broadcast user deletion for immediate logout
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "RBAC_UPDATE",
          payload: {
            entity: 'user_status',
            userId,
            status: StatutUser.INACTIVE
          }
        });
        console.log(`🚨 SECURITY: Broadcasted user deletion (INACTIVE) for user ${userId}`);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Erreur lors de la suppression de l'utilisateur" });
    }
  });

  // Reset password for a user
  // CASL: Requires 'reset_password' permission on User
  app.post("/api/users/:id/reset-password", requireAuth, attachAbility, requireResetPassword(), async (req, res) => {
     const { password } = req.body;
     const passToUse = password || req.body.temporaryPassword;

     if (!passToUse) return res.status(400).json({message: "Password required"});

     const hashedPassword = await hashPassword(passToUse);
     await db.update(users).set({ password: hashedPassword }).where(eq(users.id, req.params.id));

     await logAudit(
        req,
        "RESET_PASSWORD",
        "user",
        req.params.id,
        undefined,
        "success",
        "high"
     );

     // Domain event: password reset
     dispatchDomainEvent({
       type: "USER_PASSWORD_RESET",
       data: {
         userId: req.params.id,
         resetByUserId: req.session.user?.id,
       },
       timestamp: new Date(),
     });

     res.json({ message: "Password reset" });
  });

  // Audit Logs
  app.get("/api/audit-logs", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
    const { userId, action, resource, limit } = req.query;
    const logs = await getAuditLogs({
      userId: typeof userId === 'string' ? userId : undefined,
      action: typeof action === 'string' ? action : undefined,
      resource: typeof resource === 'string' ? resource : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
    });
    res.json(logs);
  });

  // Audit Logs Statistics
  app.get("/api/audit-logs/stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.AUDIT_LOG), async (req, res) => {
    try {
      const stats = await getAuditLogStats();
      res.json(stats);
    } catch (error) {
      console.error("Get audit stats error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des statistiques" });
    }
  });

  // Manual Purge Audit Logs (admin only)
  app.post("/api/audit-logs/purge", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.AUDIT_LOG), async (req, res) => {
    try {
      const result = await purgeOldAuditLogs();

      if (result.error) {
        return res.status(500).json({ message: result.error });
      }

      await logAudit(
        req,
        "PURGE_AUDIT_LOGS",
        "audit",
        undefined,
        { deletedCount: result.deletedCount },
        "success",
        "critical"
      );

      res.json({
        message: `Purge terminée. ${result.deletedCount} logs supprimés.`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error("Purge audit logs error:", error);
      res.status(500).json({ message: "Erreur lors de la purge des logs" });
    }
  });

  // ============================================
  // SESSION MANAGEMENT - Force logout a user
  // ============================================

  app.post("/api/sessions/:userId/terminate", requireAuth, attachAbility, requireAbility(Actions.TERMINATE, Subjects.SESSION), async (req, res) => {
    try {
      const { userId } = req.params;
      const adminUser = req.session.user;

      console.log('[SESSION TERMINATE] Request received:', {
        targetUserId: userId,
        adminUserId: adminUser?.id,
        adminUsername: adminUser?.username,
        areEqual: userId === adminUser?.id
      });

      // Cannot terminate own session
      if (userId === adminUser?.id) {
        console.log('[SESSION TERMINATE] Blocked: Admin trying to terminate own session');
        return res.status(400).json({ message: "Vous ne pouvez pas terminer votre propre session" });
      }

      // Delete from active_sessions table
      const deletedCount = await deleteUserSessions(userId);

      // Also delete from PostgreSQL session store (express-session table)
      await db.execute(`
        DELETE FROM session
        WHERE sess::text LIKE '%"userId":"${userId}"%'
      `);

      // Notify the user via WebSocket to logout immediately
      try {
        const { getWsInstance } = await import("../ws-server");
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.sendToUser(userId, {
            type: "FORCE_LOGOUT",
            payload: {
              userId,
              reason: "Votre session a été terminée par un administrateur",
              forceLogout: true
            }
          });
        }
      } catch (wsError) {
        console.error("WebSocket notification failed:", wsError);
      }

      await logAudit(
        req,
        "FORCE_LOGOUT",
        "session",
        userId,
        { terminatedBy: adminUser?.id, adminName: adminUser?.nom, sessionsDeleted: deletedCount },
        "success",
        "high"
      );

      console.log('[SESSION TERMINATE] Success:', { userId, deletedCount });
      res.json({ message: "Session terminée avec succès", deletedCount });
    } catch (error) {
      console.error("Terminate session error:", error);
      res.status(500).json({ message: "Erreur lors de la terminaison de la session" });
    }
  });

  // Get active sessions (from active_sessions table with real-time tracking)
  app.get("/api/sessions/active", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.SESSION), async (req, res) => {
    try {
      const sessions = await getActiveSessions();

      // Transform to expected format
      const formattedSessions = sessions.map(s => {
        const now = Date.now();
        const lastActivityTime = new Date(s.lastActivity).getTime();
        const timeSinceActivity = (now - lastActivityTime) / 1000 / 60; // minutes

        // Determine status based on last activity
        let status: 'active' | 'idle' = 'active';
        if (timeSinceActivity > 5) status = 'idle';

        return {
          id: s.id,
          sessionId: s.sessionId,
          userId: s.userId,
          user: {
            nom: s.userName,
            prenom: s.userPrenom,
            email: s.userEmail,
            role: s.userRole,
            agence: s.userAgence,
          },
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          deviceType: s.deviceType,
          browser: s.browser,
          os: s.os,
          location: s.location,
          loginAt: s.loginAt,
          lastActivity: s.lastActivity,
          expiresAt: s.expiresAt,
          status,
          sessionDuration: Math.round((now - new Date(s.loginAt).getTime()) / 1000 / 60), // minutes
        };
      });

      res.json(formattedSessions);
    } catch (error) {
      console.error("Get active sessions error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des sessions" });
    }
  });

  // ============================================
  // USER PERMISSIONS MANAGEMENT
  // ============================================

  // Get all permissions for a user
  app.get("/api/users/:userId/permissions", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PERMISSION), async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Fetch granular permissions with explicit join alias if needed, or just map manually
      // We join userPermissions -> permissions -> modules
      const userPerms = await db.select({
        code: permissions.code,
        moduleName: modules.name,
        granted: userPermissions.granted
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .leftJoin(modules, eq(permissions.moduleId, modules.id))
      .where(eq(userPermissions.userId, userId));

      // Transform to a map by module for legacy frontend usage
      const permissionsMap: Record<string, any> = {};
      
      // Helper to init module entry
      const getOrCreateModule = (name: string) => {
        if (!permissionsMap[name]) {
          permissionsMap[name] = {
            module_name: name,
            peut_voir: false,
            peut_creer: false,
            peut_modifier: false,
            peut_supprimer: false,
            peut_valider: false,
            peut_exporter: false
          };
        }
        return permissionsMap[name];
      };

      userPerms.forEach(p => {
        if (!p.granted) return;
        const entry = getOrCreateModule(p.moduleName || 'Unknown');
        const [, action] = p.code.split('.');
        
        // Map granular action to legacy flag
        switch (action) {
          case 'view': entry.peut_voir = true; break;
          case 'create': entry.peut_creer = true; break;
          case 'edit': entry.peut_modifier = true; break;
          case 'delete': entry.peut_supprimer = true; break;
          case 'approve': entry.peut_valider = true; break;
          case 'export': entry.peut_exporter = true; break;
        }
      });

      // Check for Caisse assignments and inject permission
      const assignments = await storage.getUserCaisseAssignments(userId);
      if (assignments && assignments.length > 0) {
          // If assigned to at least one caisse, grant view/create permissions for Caisse module
          const entry = getOrCreateModule('Caisse');
          entry.peut_voir = true;
          entry.peut_creer = true; // Needed to open session
          entry.peut_valider = true;
      }

      res.json(permissionsMap);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  // Save/Update permissions for a user (batch update - Legacy Adapter)
  app.put("/api/users/:userId/permissions", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.PERMISSION), async (req, res) => {
    try {
      const { userId } = req.params;
      const permissionsData: Record<string, {
        peut_voir: boolean;
        peut_creer: boolean;
        peut_modifier: boolean;
        peut_supprimer: boolean;
        peut_valider: boolean;
        peut_exporter: boolean;
      }> = req.body;

      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Fetch all system permissions to map codes
      const allPerms = await db.select({
        id: permissions.id,
        code: permissions.code,
        moduleName: modules.name
      })
      .from(permissions)
      .leftJoin(modules, eq(permissions.moduleId, modules.id));

      // Build list of permission IDs to grant
      const permissionIdsToGrant: string[] = [];

      Object.entries(permissionsData).forEach(([moduleName, flags]) => {
         const modulePerms = allPerms.filter(p => p.moduleName === moduleName);
         modulePerms.forEach(p => {
            const [, action] = p.code.split('.');
            let shouldGrant = false;
            switch(action) {
               case 'view': shouldGrant = flags.peut_voir; break;
               case 'create': shouldGrant = flags.peut_creer; break;
               case 'edit': shouldGrant = flags.peut_modifier; break;
               case 'delete': shouldGrant = flags.peut_supprimer; break;
               case 'approve': shouldGrant = flags.peut_valider; break;
               case 'export': shouldGrant = flags.peut_exporter; break;
            }
            if (shouldGrant) {
               permissionIdsToGrant.push(p.id);
            }
         });
      });

      // Transaction-like update: delete all for user then insert
      // Note: We only delete/replace permissions that match the legacy flags logic?
      // Or just wipe all and set new state? The endpoint implies full state update.
      // So we delete all custom permissions.
      
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

      if (permissionIdsToGrant.length > 0) {
        const values = permissionIdsToGrant.map(pid => ({
           userId,
           permissionId: pid,
           granted: true
        }));
        await db.insert(userPermissions).values(values);
      }

      await logAudit(
        req,
        "UPDATE_PERMISSIONS",
        "user_permissions",
        userId,
        { modules: Object.keys(permissionsData) },
        "success",
        "high"
      );

      res.json({ message: "Permissions mises à jour avec succès", count: permissionIdsToGrant.length });
    } catch (error) {
      console.error("Error saving permissions:", error);
      res.status(500).json({ message: "Erreur lors de la sauvegarde des permissions" });
    }
  });

  // Check if current user has a specific permission
  app.get("/api/permissions/check", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { module, action } = req.query;

      if (!module || !action) {
        return res.status(400).json({ message: "Module et action requis" });
      }
      
      // Construct expected code (simple heuristic, might need refinement if 'module' param != module name)
      // Usually module param here is 'Caisse', 'Clients' etc. or 'caisse', 'clients'.
      // Code convention is lowercase: 'caisse.view'.
      const expectedCode = `${(module as string).toLowerCase()}.${(action as string).toLowerCase()}`;

      // Admins have all permissions
      if (isAdminRole(user.role)) {
        return res.json({ allowed: true });
      }

      // Check user-specific permissions
      // Join userPermissions -> permissions
      const [permission] = await db.select()
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(and(
          eq(userPermissions.userId, user.id),
          eq(permissions.code, expectedCode),
          eq(userPermissions.granted, true)
        ));

      if (!permission) {
        // Check dynamic assignments for Caisse module
        if (module === 'Caisse' || module === 'caisse') {
             const userId = user.id;
             const assignments = await storage.getUserCaisseAssignments(userId);
             if (assignments && assignments.length > 0) {
                 // Assigned users can view and create (open sessions)
                 if (['view', 'create', 'open'].includes(action as string)) {
                     return res.json({ allowed: true });
                 }
             }
        }
        return res.json({ allowed: false });
      }

      // Permission found and granted=true (checked in query at line 853)
      // No need to check individual fields - the existence of the permission means it's allowed
      res.json({ allowed: true });
    } catch (error) {
      console.error("Error checking permission:", error);
      res.status(500).json({ message: "Erreur lors de la vérification des permissions" });
    }
  });

  // ============================================
  // CAISSE SUPERVISOR PIN AUTHENTICATION
  // ============================================

  // Verify supervisor credentials + PIN for caisse opening
  app.post("/api/auth/verify-supervisor", async (req, res) => {
    try {
      const { username, password, pin } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Identifiants requis" });
      }

      // Verify user credentials
      const user = await loginUser(username, password);
      if (!user) {
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      // Check if user has supervisor role (Architecture V3: via userRoles)
      const effectiveRole = await getEffectiveRole(user.id);
      const supervisorRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE];
      if (!supervisorRoles.includes(effectiveRole)) {
        return res.status(403).json({ message: "Rôle insuffisant. Seul un superviseur peut autoriser l'ouverture." });
      }

      // Architecture V3: caissePin est dans employes
      const caissePin = await getUserCaissePin(user.id);

      // If PIN provided, verify it
      if (pin) {
        if (!caissePin) {
          return res.status(400).json({ message: "Aucun PIN configuré. Veuillez définir votre PIN caisse.", requirePinSetup: true });
        }
        const pinValid = await comparePasswords(pin, caissePin);
        if (!pinValid) {
          return res.status(401).json({ message: "PIN incorrect" });
        }
      }

      // Return supervisor info
      res.json({
        id: user.id,
        name: `${user.prenom || ''} ${user.nom}`.trim(),
        phone: user.telephone,
        role: effectiveRole,
        hasPinConfigured: !!caissePin
      });

    } catch (error) {
      console.error("Verify supervisor error:", error);
      res.status(500).json({ message: "Erreur de vérification" });
    }
  });

  // Set/Update own caisse PIN (Admins/Chefs only)
  app.put("/api/auth/caisse-pin", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const userRole = req.session.user!.role;
      const { currentPassword, newPin } = req.body;

      // Restrict to admins and chefs
      const normalizedRole = normalizeRole(userRole);
      const authorizedRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE];
      if (!normalizedRole || !authorizedRoles.includes(normalizedRole)) {
        return res.status(403).json({ message: "Action non autorisée. Seuls les Administrateurs et Chefs d'Agence peuvent modifier leur propre PIN." });
      }

      if (!currentPassword || !newPin) {
        return res.status(400).json({ message: "Mot de passe actuel et nouveau PIN requis" });
      }

      // Validate PIN format (6 digits)
      if (!/^\d{6}$/.test(newPin)) {
        return res.status(400).json({ message: "Le PIN doit contenir exactement 6 chiffres" });
      }

      // Verify current password
      const user = await storage.getUser(userId);
      if (!user || !user.password) return res.status(404).json({ message: "Utilisateur non trouvé" });

      const passwordValid = await comparePasswords(currentPassword, user.password);
      if (!passwordValid) {
        return res.status(401).json({ message: "Mot de passe incorrect" });
      }

      // Architecture V3: caissePin dans employes
      const hashedPin = await hashPassword(newPin);
      await setUserCaissePin(userId, hashedPin);

      await logAudit(req, "SET_OWN_CAISSE_PIN", "user", userId, undefined, "success", "high");

      res.json({ message: "PIN caisse configuré avec succès" });
    } catch (error) {
      console.error("Set caisse PIN error:", error);
      res.status(500).json({ message: "Erreur lors de la configuration du PIN" });
    }
  });

  // Set/Update caisse PIN for another user (Admin/Chef only)
  app.put("/api/users/:targetId/caisse-pin", requireAuth, async (req, res) => {
    try {
      const adminId = req.session.user!.id;
      const adminRole = req.session.user!.role;
      const targetId = req.params.targetId;
      const { pin } = req.body;

      // Restrict to admins and chefs
      const normalizedRole = normalizeRole(adminRole);
      const authorizedRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE];
      if (!normalizedRole || !authorizedRoles.includes(normalizedRole)) {
        return res.status(403).json({ message: "Action non autorisée. Rôle insuffisant." });
      }

      if (!pin) {
        return res.status(400).json({ message: "Nouveau PIN requis" });
      }

      // Validate PIN format (6 digits)
      if (!/^\d{6}$/.test(pin)) {
        return res.status(400).json({ message: "Le PIN doit contenir exactement 6 chiffres" });
      }

      // Architecture V3: caissePin dans employes
      const hashedPin = await hashPassword(pin);
      await setUserCaissePin(targetId, hashedPin);

      await logAudit(req, "SET_USER_CAISSE_PIN", "user", targetId, { adminId }, "success", "critical");

      res.json({ message: "PIN utilisateur configuré avec succès" });
    } catch (error) {
      console.error("Set user caisse PIN error:", error);
      res.status(500).json({ message: "Erreur lors de la configuration du PIN utilisateur" });
    }
  });

  // ============================================
  // User Roles Management (Architecture V3)
  // ============================================

  /**
   * GET /api/users/:userId/roles - Récupérer tous les rôles d'un utilisateur
   */
  app.get("/api/users/:userId/roles", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const requesterId = req.session.user!.id;
      const requesterRole = req.session.user!.role;

      // Un utilisateur peut voir ses propres rôles, sinon il faut être admin/chef
      if (userId !== requesterId) {
        const normalizedRole = normalizeRole(requesterRole);
        const authorizedRoles = [SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.SUPERVISEUR];
        if (!normalizedRole || !authorizedRoles.includes(normalizedRole)) {
          return res.status(403).json({ error: "Non autorisé à voir les rôles de cet utilisateur" });
        }
      }

      const roles = await db.select({
        id: userRoles.id,
        role: userRoles.role,
        agenceId: userRoles.agenceId,
        isPrimary: userRoles.isPrimary,
        createdAt: userRoles.createdAt,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

      // Enrichir avec le nom de l'agence si disponible
      const enrichedRoles = await Promise.all(roles.map(async (r) => {
        let agenceNom = null;
        if (r.agenceId) {
          const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, r.agenceId));
          agenceNom = agence?.nom || null;
        }
        return {
          ...r,
          agenceNom,
        };
      }));

      res.json(enrichedRoles);
    } catch (error) {
      console.error("Get user roles error:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des rôles" });
    }
  });

  /**
   * POST /api/users/:userId/roles - Ajouter un rôle à un utilisateur
   */
  app.post("/api/users/:userId/roles", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, agenceId, isPrimary } = req.body;
      const adminRole = req.session.user!.role;

      // Seuls les admins peuvent ajouter des rôles
      const normalizedRole = normalizeRole(adminRole);
      if (!normalizedRole || !isAdminRole(normalizedRole)) {
        return res.status(403).json({ error: "Seuls les administrateurs peuvent ajouter des rôles" });
      }

      if (!role || !Object.values(SystemRole).includes(role)) {
        return res.status(400).json({ error: "Rôle invalide" });
      }

      // Vérifier que l'utilisateur existe
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Ajouter le rôle
      const [newRole] = await db.insert(userRoles).values({
        userId,
        role,
        agenceId: agenceId || null,
        isPrimary: isPrimary || false,
      }).returning();

      await logAudit(req, "ADD_USER_ROLE", "user", userId, { role, agenceId }, "success", "high");

      res.status(201).json(newRole);
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: "Ce rôle existe déjà pour cet utilisateur et cette agence" });
      }
      console.error("Add user role error:", error);
      res.status(500).json({ error: "Erreur lors de l'ajout du rôle" });
    }
  });

  /**
   * DELETE /api/users/:userId/roles/:roleId - Supprimer un rôle
   */
  app.delete("/api/users/:userId/roles/:roleId", requireAuth, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const adminRole = req.session.user!.role;

      // Seuls les admins peuvent supprimer des rôles
      const normalizedRole = normalizeRole(adminRole);
      if (!normalizedRole || !isAdminRole(normalizedRole)) {
        return res.status(403).json({ error: "Seuls les administrateurs peuvent supprimer des rôles" });
      }

      // Vérifier que le rôle appartient bien à l'utilisateur
      const [existingRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.id, roleId), eq(userRoles.userId, userId)));

      if (!existingRole) {
        return res.status(404).json({ error: "Rôle non trouvé" });
      }

      // Ne pas permettre de supprimer le dernier rôle
      const [roleCount] = await db.select({ count: userRoles.id })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      // @ts-ignore - count returns a string
      if (parseInt(roleCount?.count || '0') <= 1) {
        return res.status(400).json({ error: "Impossible de supprimer le dernier rôle d'un utilisateur" });
      }

      await db.delete(userRoles).where(eq(userRoles.id, roleId));

      await logAudit(req, "REMOVE_USER_ROLE", "user", userId, { roleId, role: existingRole.role }, "success", "high");

      res.json({ message: "Rôle supprimé avec succès" });
    } catch (error) {
      console.error("Delete user role error:", error);
      res.status(500).json({ error: "Erreur lors de la suppression du rôle" });
    }
  });

  /**
   * PUT /api/users/:userId/roles/:roleId/primary - Définir un rôle comme principal
   */
  app.put("/api/users/:userId/roles/:roleId/primary", requireAuth, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const requesterId = req.session.user!.id;
      const requesterRole = req.session.user!.role;

      // Un utilisateur peut changer son propre rôle principal, sinon il faut être admin
      if (userId !== requesterId) {
        const normalizedRole = normalizeRole(requesterRole);
        if (!normalizedRole || !isAdminRole(normalizedRole)) {
          return res.status(403).json({ error: "Non autorisé à modifier les rôles de cet utilisateur" });
        }
      }

      // Vérifier que le rôle appartient à l'utilisateur
      const [existingRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.id, roleId), eq(userRoles.userId, userId)));

      if (!existingRole) {
        return res.status(404).json({ error: "Rôle non trouvé" });
      }

      // Transaction: désactiver les autres rôles principaux et activer celui-ci
      await db.transaction(async (tx) => {
        await tx.update(userRoles)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)));

        await tx.update(userRoles)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(userRoles.id, roleId));
      });

      await logAudit(req, "SET_PRIMARY_ROLE", "user", userId, { roleId, role: existingRole.role }, "success", "medium");

      res.json({ message: "Rôle principal mis à jour" });
    } catch (error) {
      console.error("Set primary role error:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour du rôle principal" });
    }
  });

  /**
   * GET /api/my-roles - Récupérer ses propres rôles (raccourci)
   */
  app.get("/api/my-roles", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;

      const roles = await db.select({
        id: userRoles.id,
        role: userRoles.role,
        agenceId: userRoles.agenceId,
        isPrimary: userRoles.isPrimary,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

      res.json(roles);
    } catch (error) {
      console.error("Get my roles error:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des rôles" });
    }
  });
}
