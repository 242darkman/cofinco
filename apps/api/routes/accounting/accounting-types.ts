import { SystemRole } from "@shared/types/roles";
import type { Request } from "express";

/** Typed Express Request with authenticated user from requireAuth middleware */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    nom: string;
    prenom: string | null;
    role: SystemRole;
    agence?: string | null;
    agenceId?: string | null;
    email?: string;
    telephone?: string;
  };
}
