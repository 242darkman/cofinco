import type { StepComponentProps } from "../types";
import {
  GROUP_ROLE_OPTIONS,
  APPROVAL_OPTIONS,
  KYC_LEVEL_OPTIONS,
  SEGMENT_OPTIONS,
} from "../constants";

export default function StepGovernance({ formData, updateField }: StepComponentProps) {
  const toggleRole = (role: string) => {
    const current = formData.groupRoles;
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    updateField("groupRoles", next);
  };

  const toggleApproval = (item: string) => {
    const current = formData.approvalsRequiredFor;
    const next = current.includes(item)
      ? current.filter((a) => a !== item)
      : [...current, item];
    updateField("approvalsRequiredFor", next);
  };

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.rolesEnabled}
          onChange={(e) => updateField("rolesEnabled", e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm font-medium text-content-primary">Activer les roles de groupe</span>
      </label>

      {formData.rolesEnabled && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-2">
            Roles disponibles
          </label>
          <div className="flex flex-wrap gap-2">
            {GROUP_ROLE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleRole(o.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  formData.groupRoles.includes(o.value)
                    ? "bg-accent text-white"
                    : "bg-surface-subtle border border-edge-subtle text-content-muted hover:border-edge"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-content-primary mb-2">
          Approbations requises pour
        </label>
        <div className="space-y-2">
          {APPROVAL_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.approvalsRequiredFor.includes(o.value)}
                onChange={() => toggleApproval(o.value)}
                className="accent-accent"
              />
              <span className="text-sm text-content-primary">{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-edge-subtle pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Niveau KYC minimum
            </label>
            <select
              value={formData.minKycLevel}
              onChange={(e) => updateField("minKycLevel", e.target.value)}
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            >
              {KYC_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Segment minimum
            </label>
            <select
              value={formData.minSegmentRequired}
              onChange={(e) => updateField("minSegmentRequired", e.target.value)}
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            >
              {SEGMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
