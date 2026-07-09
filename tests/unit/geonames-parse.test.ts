import { describe, it, expect } from 'vitest';
import { mapCityLine } from '../../seeds/geonames-parse';

/** Construit une ligne GeoNames (19 colonnes TSV) avec surcharges par index. */
function geonamesFields(overrides: Record<number, string> = {}): string[] {
  const base = [
    '2260535',            // 0 geonameId
    'Brazzaville',        // 1 name
    'Brazzaville',        // 2 asciiname
    'Brazaville,BZV',     // 3 alternatenames
    '-4.26613',           // 4 latitude
    '15.28318',           // 5 longitude
    'P',                  // 6 feature class
    'PPLC',               // 7 feature code
    'CG',                 // 8 country code (ISO2)
    '',                   // 9 cc2
    '12',                 // 10 admin1 code
    '',                   // 11 admin2 code
    '',                   // 12 admin3
    '',                   // 13 admin4
    '1284609',            // 14 population
    '',                   // 15 elevation
    '314',                // 16 dem
    'Africa/Brazzaville', // 17 timezone
    '2019-09-05',         // 18 modification date
  ];
  for (const [i, v] of Object.entries(overrides)) base[Number(i)] = v;
  return base;
}

const paysMap = new Map([
  ['CG', 'uuid-cg'],
  ['CM', 'uuid-cm'],
]);

describe('mapCityLine — parsing GeoNames cities5000', () => {
  it('mappe une ville "populated place" et résout le pays', () => {
    const row = mapCityLine(geonamesFields(), paysMap);
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      geonameId: 2260535,
      nom: 'Brazzaville',
      nomAscii: 'Brazzaville',
      paysId: 'uuid-cg',
      countryCode: 'CG',
      admin1Code: '12',
      population: 1284609,
      featureCode: 'PPLC',
      latitude: '-4.26613',
      longitude: '15.28318',
      timezone: 'Africa/Brazzaville',
    });
  });

  it('ignore les entrées non "populated place" (feature class ≠ P)', () => {
    expect(mapCityLine(geonamesFields({ 6: 'A' }), paysMap)).toBeNull();
    expect(mapCityLine(geonamesFields({ 6: 'H' }), paysMap)).toBeNull();
  });

  it('ignore une ligne tronquée (< 18 colonnes)', () => {
    expect(mapCityLine(['1', 'x', 'x'], paysMap)).toBeNull();
  });

  it('ignore un geonameId non numérique', () => {
    expect(mapCityLine(geonamesFields({ 0: 'abc' }), paysMap)).toBeNull();
  });

  it("laisse paysId null quand le pays n'est pas au référentiel (countryCode conservé)", () => {
    const row = mapCityLine(geonamesFields({ 8: 'ZZ' }), paysMap);
    expect(row?.paysId).toBeNull();
    expect(row?.countryCode).toBe('ZZ');
  });

  it('borne la population et retombe à 0 si absente/invalide', () => {
    expect(mapCityLine(geonamesFields({ 14: '' }), paysMap)?.population).toBe(0);
    expect(mapCityLine(geonamesFields({ 14: 'NaN' }), paysMap)?.population).toBe(0);
    expect(mapCityLine(geonamesFields({ 14: '9999999999' }), paysMap)?.population).toBe(2147483647);
  });

  it('replie nomAscii sur le nom, et le nom sur "inconnu" si vide', () => {
    expect(mapCityLine(geonamesFields({ 2: '' }), paysMap)?.nomAscii).toBe('Brazzaville');
    const empty = mapCityLine(geonamesFields({ 1: '', 2: '' }), paysMap);
    expect(empty?.nom).toBe('inconnu');
    expect(empty?.nomAscii).toBeNull();
  });
});
