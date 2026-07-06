import { useState, useEffect } from "react";
import type { StepComponentProps } from "../types";
import {
  FIRST_CONTRIBUTION_RULE_OPTIONS,
  CALENDAR_MODE_OPTIONS,
  SHIFT_OPTIONS,
  WEEKDAY_LABELS,
} from "../constants";
import { settingsExtendedApi } from "../../../../lib/api-client";

export default function StepCalendar({ formData, updateField }: StepComponentProps) {
  const [calendars, setCalendars] = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    settingsExtendedApi.getHolidayCalendars()
      .then((data) => setCalendars(data || []))
      .catch(() => setCalendars([]));
  }, []);

  const toggleWeekday = (day: number) => {
    const bit = 1 << day;
    updateField("weekdaysMask", formData.weekdaysMask ^ bit);
  };

  const isDayActive = (day: number) => (formData.weekdaysMask & (1 << day)) !== 0;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Premiere cotisation
        </label>
        <select
          value={formData.firstContributionRule}
          onChange={(e) => updateField("firstContributionRule", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {FIRST_CONTRIBUTION_RULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {formData.firstContributionRule === "AFTER_N_DAYS" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Jours de grace avant premiere cotisation
          </label>
          <input
            type="number"
            value={formData.gracePeriodContribution}
            onChange={(e) => updateField("gracePeriodContribution", e.target.value)}
            min="0"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      )}

      {formData.firstContributionRule === "NEXT_WEEKDAY" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Jour prefere
          </label>
          <select
            value={formData.preferredWeekday}
            onChange={(e) => updateField("preferredWeekday", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            <option value="">-- Choisir --</option>
            {WEEKDAY_LABELS.map((d) => (
              <option key={d.value} value={d.value.toString()}>{d.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Mode calendrier
        </label>
        <select
          value={formData.collectionCalendarMode}
          onChange={(e) => updateField("collectionCalendarMode", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {CALENDAR_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {formData.collectionCalendarMode === "CUSTOM_WEEKDAYS" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-2">
            Jours autorises
          </label>
          <div className="flex gap-2">
            {WEEKDAY_LABELS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${
                  isDayActive(d.value)
                    ? "bg-accent text-white"
                    : "bg-surface-subtle border border-edge-subtle text-content-muted"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {formData.collectionCalendarMode !== "ALL_DAYS" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Si jour non-ouvrable
          </label>
          <select
            value={formData.shiftNonWorkingDay}
            onChange={(e) => updateField("shiftNonWorkingDay", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {SHIFT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Calendrier jours feries
        </label>
        <select
          value={formData.holidayCalendarId}
          onChange={(e) => updateField("holidayCalendarId", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          <option value="">Aucun</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
        <p className="text-[10px] text-content-muted mt-1">
          Les jours feries seront exclus du calendrier de cotisation
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Fuseau horaire
        </label>
        <input
          type="text"
          value={formData.timezone}
          onChange={(e) => updateField("timezone", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        />
        <p className="text-[10px] text-content-muted mt-1">Ex : Africa/Brazzaville, Africa/Lagos</p>
      </div>
    </div>
  );
}
