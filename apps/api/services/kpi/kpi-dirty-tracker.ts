/**
 * KPI Dirty Tracker — comptabilité des périodes à rafraîchir.
 *
 * Une opération antidatée (rejeu offline tardif, écriture comptable sur une
 * période antérieure) doit invalider le snapshot de SA période, pas
 * seulement la période courante. Ce module accumule les clés de période
 * touchées (dérivées en timezone MÉTIER) entre deux passes du worker.
 *
 * Module pur (aucune dépendance DB/WS) : testable unitairement.
 */
import { currentPeriodKeys } from "./kpi-periods";

export interface DirtyPeriods {
  /** Clés mensuelles 'YYYY-MM', triées en ordre ascendant */
  monthKeys: string[];
  /** Clés annuelles 'YYYY', triées en ordre ascendant */
  yearKeys: string[];
}

export interface DirtyPeriodTracker {
  /**
   * Marque la période contenant la date donnée (timezone métier).
   * Retourne false si la date est invalide (rien n'est marqué).
   */
  markDate(date: Date): boolean;
  /** Marque la période courante (cron, amorçage, dates inexploitables). */
  markCurrent(now?: Date): void;
  /** Prélève et vide l'ensemble des périodes marquées. */
  drain(): DirtyPeriods;
  /** Ré-arme des périodes non traitées (échec de rafraîchissement). */
  restore(periods: DirtyPeriods): void;
  /** Nombre de périodes mensuelles actuellement marquées. */
  size(): number;
}

export function createDirtyPeriodTracker(): DirtyPeriodTracker {
  const monthKeys = new Set<string>();
  const yearKeys = new Set<string>();

  function markDate(date: Date): boolean {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const keys = currentPeriodKeys(date);
    monthKeys.add(keys.monthKey);
    yearKeys.add(keys.yearKey);
    return true;
  }

  return {
    markDate,
    markCurrent(now = new Date()) {
      markDate(now);
    },
    drain(): DirtyPeriods {
      const drained: DirtyPeriods = {
        monthKeys: [...monthKeys].sort(),
        yearKeys: [...yearKeys].sort(),
      };
      monthKeys.clear();
      yearKeys.clear();
      return drained;
    },
    restore(periods: DirtyPeriods) {
      for (const key of periods.monthKeys) monthKeys.add(key);
      for (const key of periods.yearKeys) yearKeys.add(key);
    },
    size() {
      return monthKeys.size;
    },
  };
}
