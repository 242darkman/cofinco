import { isCriticalPermissionFromDb } from '../../authorization/critical-patterns';
import { isReasonRequiredForCritical } from './feature-flags.service';

/**
 * Vérifie si une permission nécessite une justification en se basant sur les modèles de la BD
 */
export async function requiresReason(permissionCode: string): Promise<boolean> {
  const requireReasonEnabled = await isReasonRequiredForCritical();
  if (!requireReasonEnabled) {
    return false;
  }

  return isCriticalPermissionFromDb(permissionCode);
}

/**
 * Valide la justification pour une modification de permission critique
 */
export async function validateReasonForCritical(
  permissionCode: string,
  reason: string | undefined | null,
  reasonRequired: boolean
): Promise<{ valid: boolean; error?: string }> {
  if (!reasonRequired) {
    return { valid: true };
  }

  const isCritical = await isCriticalPermissionFromDb(permissionCode);
  if (isCritical && (!reason || reason.trim().length === 0)) {
    return {
      valid: false,
      error: `La permission "${permissionCode}" est critique et nécessite une justification`,
    };
  }

  return { valid: true };
}
