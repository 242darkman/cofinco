import { describe, it, expect } from 'vitest';
import { canTransition } from 'server/services/coffre/state-machine';

describe('Coffre-Fort State Machine', () => {
  it('should allow valid transitions', () => {
    expect(canTransition('Demandé', 'Validé')).toBe(true);
    expect(canTransition('Demandé', 'Rejeté')).toBe(true);
    expect(canTransition('Demandé', 'Annulé')).toBe(true); // Added this as it's in the code
    expect(canTransition('Validé', 'Exécuté')).toBe(true);
  });

  it('should prevent invalid transitions', () => {
    expect(canTransition('Demandé', 'Exécuté')).toBe(false); // Must be Validé first
    expect(canTransition('Rejeté', 'Validé')).toBe(false); // Terminal
    expect(canTransition('Exécuté', 'Annulé')).toBe(false); // Terminal
    expect(canTransition('Validé', 'Annulé')).toBe(false); // Validé -> Exécuté only
  });

  it('should handle same state transitions (usually false unless idempotent)', () => {
    // In our logic, usually we don't transition to same state unless specific logic allows it
    expect(canTransition('Demandé', 'Demandé')).toBe(false);
  });
});
