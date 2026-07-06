/**
 * Erreurs structurées pour le workflow de réévaluation.
 * Permet de distinguer les erreurs métier (forwarded au client) des erreurs inattendues (500 générique).
 */

export type ReevaluationErrorCode =
  | 'REEVALUATION_NOT_FOUND'
  | 'DEMANDE_NOT_FOUND'
  | 'TRANSITION_INVALIDE'
  | 'CONFLIT_INTERETS'
  | 'REEVALUATION_VERROUILLEE'
  | 'ANNULATION_IMPOSSIBLE';

export class ReevaluationError extends Error {
  public readonly code: ReevaluationErrorCode;
  public readonly httpStatus: number;

  constructor(code: ReevaluationErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'ReevaluationError';
    this.code = code;
    this.httpStatus = httpStatus;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export function isReevaluationError(err: unknown): err is ReevaluationError {
  return err instanceof ReevaluationError;
}
