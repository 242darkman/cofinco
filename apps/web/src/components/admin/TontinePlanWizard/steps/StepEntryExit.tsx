import type { StepComponentProps } from "../types";
import { currencySymbol } from "@shared/config/currency";

export default function StepEntryExit({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-5">
      {/* Join Fee */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.joinFeeEnabled}
          onChange={(e) => updateField("joinFeeEnabled", e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm font-medium text-content-primary">Frais d'adhesion</span>
      </label>

      {formData.joinFeeEnabled && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Montant ({sym})
          </label>
          <input
            type="number"
            value={formData.joinFeeAmount}
            onChange={(e) => updateField("joinFeeAmount", e.target.value)}
            min="0"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      )}

      {/* Exit */}
      <div className="border-t border-edge-subtle pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.exitAllowed}
            onChange={(e) => updateField("exitAllowed", e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm font-medium text-content-primary">Autoriser la sortie volontaire</span>
        </label>
      </div>

      {formData.exitAllowed && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Frais de sortie (%)
            </label>
            <input
              type="number"
              value={formData.exitFeePercent}
              onChange={(e) => updateField("exitFeePercent", e.target.value)}
              min="0"
              max="100"
              step="0.5"
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Periodes de preavis
            </label>
            <input
              type="number"
              value={formData.exitNoticePeriods}
              onChange={(e) => updateField("exitNoticePeriods", e.target.value)}
              min="0"
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Replacement & Membership */}
      <div className="border-t border-edge-subtle pt-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.replacementAllowed}
            onChange={(e) => updateField("replacementAllowed", e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-content-primary">Autoriser le remplacement de membres</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.transferMembershipAllowed}
            onChange={(e) => updateField("transferMembershipAllowed", e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-content-primary">Autoriser le transfert d'adhesion</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.allowMidCycleJoin}
            onChange={(e) => updateField("allowMidCycleJoin", e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-content-primary">Autoriser l'adhesion en cours de cycle</span>
        </label>
      </div>
    </div>
  );
}
