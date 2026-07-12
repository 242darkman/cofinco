import { describe, expect, it } from 'vitest';

import { incrementLettrageKey } from '../../apps/api/services/lettrage-key';

describe('incrementLettrageKey', () => {
  it('incrémente les clés alphabétiques de lettrage', () => {
    expect(incrementLettrageKey('AA')).toBe('AB');
    expect(incrementLettrageKey('AZ')).toBe('BA');
    expect(incrementLettrageKey('ZZ')).toBe('AAA');
  });
});
