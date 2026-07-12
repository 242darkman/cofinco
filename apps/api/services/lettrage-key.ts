/**
 * Incrémente une clé alphabétique de lettrage.
 *
 * La séquence suit l'ordre AA, AB, ... AZ, BA, ... ZZ, AAA afin de conserver
 * une clé courte tout en restant lisible dans les exports comptables.
 */
export function incrementLettrageKey(key: string): string {
  const chars = key.split('');

  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] < 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
  }

  return 'A' + chars.join('');
}
