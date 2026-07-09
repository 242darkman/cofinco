import { describe, it, expect } from 'vitest';
import { canTransition } from '../../apps/api/services/coffre/state-machine';

describe('Coffre-Fort State Machine', () => {
  it('should allow valid transitions', () => {
    expect(canTransition('REQUESTED', 'VALIDATED')).toBe(true);
    expect(canTransition('REQUESTED', 'REJECTED')).toBe(true);
    expect(canTransition('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('VALIDATED', 'EXECUTED')).toBe(true);
  });

  it('should prevent invalid transitions', () => {
    expect(canTransition('REQUESTED', 'EXECUTED')).toBe(false); // Must be VALIDATED first
    expect(canTransition('REJECTED', 'VALIDATED')).toBe(false); // Terminal
    expect(canTransition('EXECUTED', 'CANCELLED')).toBe(false); // Terminal
    expect(canTransition('VALIDATED', 'CANCELLED')).toBe(false); // VALIDATED -> EXECUTED only
  });

  it('should handle same state transitions (usually false unless idempotent)', () => {
    expect(canTransition('REQUESTED', 'REQUESTED')).toBe(false);
  });
});
