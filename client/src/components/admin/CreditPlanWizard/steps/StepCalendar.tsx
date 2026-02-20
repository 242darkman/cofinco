import type { StepComponentProps } from "../types";
import {
  FIRST_DUE_RULE_OPTIONS,
  CALENDAR_MODE_OPTIONS,
  SHIFT_OPTIONS,
  WEEKDAY_LABELS,
} from "../constants";

export default function StepCalendar({ formData, updateField }: StepComponentProps) {
  const toggleWeekday = (dayIndex: number) => {
    const current = formData.weekdaysMask;
    const bit = 1 << dayIndex;
    updateField("weekdaysMask", current ^ bit);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Règle de première échéance
        </label>
        <select
          value={formData.firstDueRule}
          onChange={(e) => updateField("firstDueRule", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {FIRST_DUE_RULE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {formData.firstDueRule === "AFTER_N_DAYS" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Jours de grâce
          </label>
          <input
            type="number"
            value={formData.gracePeriodDays}
            onChange={(e) => updateField("gracePeriodDays", e.target.value)}
            min={0}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      )}

      {formData.firstDueRule === "NEXT_WEEKDAY" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Jour préféré</label>
          <select
            value={formData.preferredWeekday}
            onChange={(e) => updateField("preferredWeekday", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            <option value="">Sélectionner</option>
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="border-t border-edge-subtle pt-4">
        <h4 className="text-sm font-medium text-content-primary mb-3">Mode calendrier</h4>
        <select
          value={formData.calendarMode}
          onChange={(e) => updateField("calendarMode", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {CALENDAR_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {formData.calendarMode === "CUSTOM_WEEKDAYS" && (
        <div>
          <label className="block text-xs text-content-secondary mb-2">Jours actifs</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, i) => {
              const active = (formData.weekdaysMask & (1 << i)) !== 0;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "bg-surface-subtle border border-edge-subtle text-content-muted"
                  }`}
                >
                  {label.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {formData.calendarMode !== "ALL_DAYS" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Décalage jours non ouvrés
          </label>
          <select
            value={formData.shiftNonWorkingDay}
            onChange={(e) => updateField("shiftNonWorkingDay", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {SHIFT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.allowManualFirstDueDate}
          onChange={(e) => updateField("allowManualFirstDueDate", e.target.checked)}
          className="rounded border-input-border"
        />
        <span className="text-sm text-content-primary">
          Autoriser la saisie manuelle de la date de première échéance
        </span>
      </label>
    </div>
  );
}
