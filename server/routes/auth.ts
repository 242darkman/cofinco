import type { Express } from "express";
import { insertUserSchema, users, userPermissions } from "@shared/schema";
import { storage } from "../storage";
import { loginUser, registerUser, requireAuth, requireRole, hashPassword, comparePasswords } from "../auth";
import { logAudit, logLoginAttempt, isAccountLocked, validatePassword, getAuditLogs, clearLoginAttemptsOnSuccess, purgeOldAuditLogs, getAuditLogStats } from "../audit";
import { createSessionRecord, deleteSessionRecord, deleteUserSessions, getActiveSessions } from "../session-tracker";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db";

export function registerAuthRoutes(app: Express) {
  // Init Admin
  app.get("/api/init-admin", async (req, res) => {
    try {
      const existingUsers = await storage.getAllUsers();
      if (existingUsers.length > 0) {
        return res.status(403).json({ message: "Admin user already exists" });
      }

      const hashedPassword = await hashPassword("admin123");
      const adminUser = await storage.createUser({
        username: "admin",
        password: hashedPassword,
        role: "admin",
        nom: "Administrator",
        prenom: "System",
        email: "admin@system.local",
        telephone: "00000000",
        statut: "Actif",
        mustChangePassword: true, // Force password change on first login
      } as any); // forced cast if schema strictness varies, but statut is correct

      res.json(adminUser);
    } catch (error) {
      console.error("Error creating admin user:", error);
      res.status(500).json({ message: "Failed to create admin user" });
    }
  });

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      if (await isAccountLocked(username)) {
        await logLoginAttempt(username, req, false, "account_locked");
        return res.status(403).json({ message: "Account is locked due to too many failed attempts. Please try again later." });
      }

      const user = await loginUser(username, password);
      
      if (!user) {
        // Log failed attempt
        await logLoginAttempt(username, req, false, "invalid_credentials");
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.statut !== "Actif") {
        await logLoginAttempt(username, req, false, "account_disabled");
        return res.status(403).json({ message: "Account disabled" });
      }

      // Success
      await clearLoginAttemptsOnSuccess(username);
      await logLoginAttempt(username, req, true);
      
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
                 targetRole: "admin"
              }
           });
           wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
           
           // Activité en temps réel
           wsInstance.broadcast({
             type: "LIVE_ACTIVITY",
             payload: {
               action: `Connexion: ${user.prenom || ''} ${user.nom}`.trim(),
               user: user.agence || 'Siège',
               type: 'login',
               timestamp: new Date().toISOString()
             }
           });
        }
      } catch (e) {
        console.error("Failed to fallback to WS notification:", e);
      }
      
      req.session.userId = user.id;
      req.session.user = {
          id: user.id,
          username: user.username || user.nom,
          nom: user.nom,
          prenom: user.prenom,
          role: user.role || 'agent',
          agence: user.agence,
          email: user.email || undefined,
          telephone: user.telephone || undefined,
          mustChangePassword: user.mustChangePassword || false
      };

      // Try to get employee ID and agency ID
      try {
        const employe = await storage.getEmployeByUserId(user.id);
        if (employe) {
             req.session.user.agenceId = employe.agenceId || undefined;
        } else if (user.agence) {
             // Fallback: If no employee record (e.g. Admin), try to find Agence by name
             const agences = await storage.getAllAgences();
             const agence = agences.find(a => a.nom === user.agence);
             if (agence) {
                  req.session.user.agenceId = agence.id;
             }
        }
      } catch (e) {
        console.error("Error fetching employee data for login:", e);
      }

      // Save session and wait for it to complete before responding
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

      res.json({
        user: req.session.user,
        message: "Login successful",
        mustChangePassword: user.mustChangePassword || false
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

    // Auto-repair session if agenceId is missing
    if (!req.session.user.agenceId && req.session.user.agence) {
       try {
          const employe = await storage.getEmployeByUserId(req.session.user.id);
          if (employe) {
               req.session.user.agenceId = employe.agenceId || undefined;
               await new Promise<void>((resolve) => req.session.save(() => resolve()));
          } else {
             // Fallback lookup by name
             const agences = await storage.getAllAgences();
             const agence = agences.find(a => a.nom === req.session.user?.agence);
             if (agence && req.session.user) {
                req.session.user.agenceId = agence.id;
                await new Promise<void>((resolve) => req.session.save(() => resolve()));
             }
          }
       } catch (e) {
         console.error("Session repair failed:", e);
       }
    }

    res.json(req.session.user);
  });

  app.post("/api/auth/verify-pin", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN requis" });

      const user = await storage.getUser(req.session.user!.id);
      if (!user) return res.status(401).json({ error: "Session invalide. Veuillez vous reconnecter." });

      if (!user.caissePin) {
         return res.status(400).json({ error: "Aucun PIN configuré", requirePinSetup: true });
      }

      const isValid = await comparePasswords(pin, user.caissePin);
      
      if (!isValid) {
          return res.status(401).json({ error: "PIN incorrect" });
      }
      
      // Return same structure as verify-supervisor
      return res.json({
          id: user.id,
          username: user.username,
          name: `${user.prenom} ${user.nom}`, // Format name properly
          role: user.role,
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

      const { nom, prenom, email, telephone, username } = req.body;
      
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
    const validation = validatePassword(newPassword);
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

  app.post("/api/auth/register", requireRole("admin"), async (req, res) => {
    try {
      // Validate complexity first
      if (req.body.password) {
          const validation = validatePassword(req.body.password);
          if (!validation.valid) return res.status(400).json(validation);
      }

      const parsed = insertUserSchema.safeParse(req.body);
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
      
      await logAudit(
        req,
        "CREATE_USER",
        "user",
        user.id,
        { username: user.username, role: user.role },
        "success",
        "medium"
      );

      res.status(201).json(user);
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // User Management
  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const updatedUser = await storage.updateUser(id, updateData);
      if (!updatedUser) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      
      res.json(updatedUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users", requireRole("admin"), async (req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.get("/api/users/:id", requireRole("admin"), async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const userId = req.params.id;
      const [updated] = await db.update(users).set(req.body).where(eq(users.id, userId)).returning();
      
      if (updated) {
         await logAudit(
            req,
            "UPDATE_USER",
            "user",
            userId,
            req.body,
            "success",
            "medium"
         );
      }
      
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Update failed" });
    }
  });

  app.delete("/api/users/:id", requireRole("admin"), async (req, res) => {
      await db.delete(users).where(eq(users.id, req.params.id));
      
      await logAudit(
        req,
        "DELETE_USER",
        "user",
        req.params.id,
        undefined,
        "success",
        "high"
      );

      res.sendStatus(200);
  });

  app.post("/api/users/:id/reset-password", requireRole("admin"), async (req, res) => {
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

     res.json({ message: "Password reset" });
  });

  // Audit Logs
  app.get("/api/audit-logs", requireRole("admin"), async (req, res) => {
    const logs = await getAuditLogs();
    res.json(logs);
  });

  // Audit Logs Statistics
  app.get("/api/audit-logs/stats", requireRole("admin"), async (req, res) => {
    try {
      const stats = await getAuditLogStats();
      res.json(stats);
    } catch (error) {
      console.error("Get audit stats error:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des statistiques" });
    }
  });

  // Manual Purge Audit Logs (admin only)
  app.post("/api/audit-logs/purge", requireRole("admin"), async (req, res) => {
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

  app.post("/api/sessions/:userId/terminate", requireRole("admin"), async (req, res) => {
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
            type: "NOTIFICATION",
            payload: {
              type: "FORCE_LOGOUT",
              message: "Votre session a été terminée par un administrateur",
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
  app.get("/api/sessions/active", requireRole("admin"), async (req, res) => {
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
  app.get("/api/users/:userId/permissions", requireRole("admin"), async (req, res) => {
    try {
      const { userId } = req.params;
      const permissions = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));

      // Transform to a map by module for easier frontend usage
      const permissionsMap: Record<string, any> = {};
      permissions.forEach(p => {
        permissionsMap[p.moduleName] = {
          module_name: p.moduleName,
          peut_voir: p.peutVoir,
          peut_creer: p.peutCreer,
          peut_modifier: p.peutModifier,
          peut_supprimer: p.peutSupprimer,
          peut_valider: p.peutValider,
          peut_exporter: p.peutExporter
        };
      });

      // Check for Caisse assignments and inject permission
      const assignments = await storage.getUserCaisseAssignments(userId);
      if (assignments && assignments.length > 0) {
          // If assigned to at least one caisse, grant view/create permissions for Caisse module
          if (!permissionsMap['Caisse']) {
              permissionsMap['Caisse'] = {
                  module_name: 'Caisse',
                  peut_voir: true,
                  peut_creer: true, // Needed to open session
                  peut_modifier: false,
                  peut_supprimer: false,
                  peut_valider: true,
                  peut_exporter: false
              };
          } else {
              // Upgrade existing permissions
              permissionsMap['Caisse'].peut_voir = true;
              permissionsMap['Caisse'].peut_creer = true;
              permissionsMap['Caisse'].peut_valider = true;
          }
      }

      res.json(permissionsMap);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des permissions" });
    }
  });

  // Save/Update permissions for a user (batch update)
  app.put("/api/users/:userId/permissions", requireRole("admin"), async (req, res) => {
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

      // Delete existing permissions for this user
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

      // Insert new permissions
      const permissionsToInsert = Object.entries(permissionsData).map(([moduleName, perms]) => ({
        userId,
        moduleName,
        peutVoir: perms.peut_voir || false,
        peutCreer: perms.peut_creer || false,
        peutModifier: perms.peut_modifier || false,
        peutSupprimer: perms.peut_supprimer || false,
        peutValider: perms.peut_valider || false,
        peutExporter: perms.peut_exporter || false
      }));

      if (permissionsToInsert.length > 0) {
        await db.insert(userPermissions).values(permissionsToInsert);
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

      res.json({ message: "Permissions mises à jour avec succès", count: permissionsToInsert.length });
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

      // Admins have all permissions
      if (user.role === "admin" || user.role === "Administrateur") {
        return res.json({ allowed: true });
      }

      // Check user-specific permissions
      const [permission] = await db.select()
        .from(userPermissions)
        .where(and(
          eq(userPermissions.userId, user.id),
          eq(userPermissions.moduleName, module as string)
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

      const actionMap: Record<string, keyof typeof permission> = {
        'view': 'peutVoir',
        'create': 'peutCreer',
        'edit': 'peutModifier',
        'delete': 'peutSupprimer',
        'validate': 'peutValider',
        'export': 'peutExporter'
      };

      const permKey = actionMap[action as string];
      const allowed = permKey ? permission[permKey] : false;

      res.json({ allowed });
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

      // Check if user has supervisor role
      const supervisorRoles = ["admin", "Administrateur", "chef_agence", "Chef d'Agence"];
      if (!user.role || !supervisorRoles.includes(user.role)) {
        return res.status(403).json({ message: "Rôle insuffisant. Seul un superviseur peut autoriser l'ouverture." });
      }

      // If PIN provided, verify it
      if (pin) {
        if (!user.caissePin) {
          return res.status(400).json({ message: "Aucun PIN configuré. Veuillez définir votre PIN caisse.", requirePinSetup: true });
        }
        const pinValid = await comparePasswords(pin, user.caissePin);
        if (!pinValid) {
          return res.status(401).json({ message: "PIN incorrect" });
        }
      }

      // Return supervisor info
      res.json({
        id: user.id,
        name: `${user.prenom || ''} ${user.nom}`.trim(),
        phone: user.telephone,
        role: user.role,
        hasPinConfigured: !!user.caissePin
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
      const authorizedRoles = ["admin", "Administrateur", "chef_agence", "Chef d'Agence"];
      if (!authorizedRoles.includes(userRole)) {
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

      // Hash and save the new PIN
      const hashedPin = await hashPassword(newPin);
      await db.update(users).set({ caissePin: hashedPin }).where(eq(users.id, userId));

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
      const authorizedRoles = ["admin", "Administrateur", "chef_agence", "Chef d'Agence"];
      if (!authorizedRoles.includes(adminRole)) {
        return res.status(403).json({ message: "Action non autorisée. Rôle insuffisant." });
      }

      if (!pin) {
        return res.status(400).json({ message: "Nouveau PIN requis" });
      }

      // Validate PIN format (6 digits)
      if (!/^\d{6}$/.test(pin)) {
        return res.status(400).json({ message: "Le PIN doit contenir exactement 6 chiffres" });
      }

      // Hash and save the new PIN
      const hashedPin = await hashPassword(pin);
      await db.update(users).set({ caissePin: hashedPin }).where(eq(users.id, targetId));

      await logAudit(req, "SET_USER_CAISSE_PIN", "user", targetId, { adminId }, "success", "critical");

      res.json({ message: "PIN utilisateur configuré avec succès" });
    } catch (error) {
      console.error("Set user caisse PIN error:", error);
      res.status(500).json({ message: "Erreur lors de la configuration du PIN utilisateur" });
    }
  });
}
