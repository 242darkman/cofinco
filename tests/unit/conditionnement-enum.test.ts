import { describe, it, expect } from 'vitest';
import { typeConditionnementEnum } from '@shared/enum/enums';
import {
  TypeConditionnement,
  TYPE_CONDITIONNEMENT_VALUES,
  TYPE_CONDITIONNEMENT_LABELS,
  TYPE_CONDITIONNEMENT_OPTIONS,
  getTypeConditionnementLabel,
} from '@shared/enum/status-constants';

describe('Enum type_conditionnement', () => {
  it('utilise des valeurs SCREAMING_SNAKE_CASE sans espace ni accent', () => {
    for (const value of typeConditionnementEnum.enumValues) {
      expect(value).toMatch(/^[A-Z]+(?:_[A-Z]+)*$/);
    }
  });

  it('reste aligné entre le pgEnum, les valeurs partagées et l\'objet const', () => {
    expect([...TYPE_CONDITIONNEMENT_VALUES]).toEqual([...typeConditionnementEnum.enumValues]);
    expect(Object.values(TypeConditionnement)).toEqual([...typeConditionnementEnum.enumValues]);
  });

  it('expose un label FR pour chaque valeur', () => {
    for (const value of typeConditionnementEnum.enumValues) {
      expect(TYPE_CONDITIONNEMENT_LABELS[value]).toBeTruthy();
    }
    expect(TYPE_CONDITIONNEMENT_OPTIONS).toHaveLength(typeConditionnementEnum.enumValues.length);
  });

  it('getTypeConditionnementLabel mappe les valeurs et gère les cas limites', () => {
    expect(getTypeConditionnementLabel(TypeConditionnement.SAC_SCELLE)).toBe('Sac scellé');
    expect(getTypeConditionnementLabel(TypeConditionnement.MALLETTE)).toBe('Mallette');
    expect(getTypeConditionnementLabel(TypeConditionnement.ENVELOPPE)).toBe('Enveloppe');
    expect(getTypeConditionnementLabel(TypeConditionnement.AUTRE)).toBe('Autre');
    expect(getTypeConditionnementLabel(null)).toBe('—');
    expect(getTypeConditionnementLabel(undefined)).toBe('—');
    expect(getTypeConditionnementLabel('INCONNU')).toBe('INCONNU');
  });
});
