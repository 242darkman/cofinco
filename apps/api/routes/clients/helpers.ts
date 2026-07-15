import { type Request } from "express";
import { db } from "../../db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { Actions, Subjects } from "@shared/ability";

// Helper: verify client belongs to user's agency (non-admin only)
export async function verifyClientAccess(req: Request, clientId: string): Promise<boolean> {
  const user = req.user as any;
  if (!user) return false;
  // Users with global manage can access all clients
  if ((req as any).ability?.can(Actions.MANAGE, 'all') || (req as any).ability?.can(Actions.MANAGE, Subjects.CLIENTS)) return true;
  // Non-admins: check client belongs to user's agency
  const [client] = await db.select({ agenceId: clients.agenceId }).from(clients).where(eq(clients.id, clientId));
  if (!client) return false;
  return client.agenceId === (req as any).selectedAgenceId || client.agenceId === user.agenceId;
}

// Helper: verify client belongs to user's agency (non-admin only)
export async function checkClientScoreAccess(req: any, res: any): Promise<boolean> {
  if (req.ability?.can(Actions.MANAGE, 'all') || req.ability?.can(Actions.MANAGE, Subjects.CLIENTS)) return true;
  const cl = await db.query.clients.findFirst({
    where: eq(clients.id, req.params.id),
    columns: { id: true, agenceId: true },
  });
  if (!cl) { res.status(404).json({ message: "Client introuvable" }); return false; }
  if (cl.agenceId !== req.session?.user?.agenceId) { res.status(403).json({ message: "Accès refusé" }); return false; }
  return true;
}
