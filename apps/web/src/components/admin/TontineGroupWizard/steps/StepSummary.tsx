import type { ReactNode } from "react";
import type { StepComponentProps } from "../types";
import { currencySymbol } from "@shared/config/currency";
import {
  FREQUENCE_OPTIONS,
  DISTRIBUTION_TYPE_OPTIONS,
  PAYOUT_ORDER_MODE_OPTIONS,
} from "../../TontinePlanWizard/constants";
import { END_RULE_OPTIONS } from "../constants";

function findLabel(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between py-1">
      <span className="text-xs text-content-secondary">{label}</span>
      <span className="text-xs font-medium text-content-primary">{value}</span>
    </div>
  );
}

export default function StepSummary({ formData }: StepComponentProps) {
  const sym = currencySymbol();
  const estimatedPot = (parseFloat(formData.montantCotisation) || 0) * (parseInt(formData.nombreMembres) || 0);

  return (
    <div className="space-y-4">
      {/* Estimated pot */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-center">
        <p className="text-[10px] text-content-muted uppercase font-semibold">Pot total estime</p>
        <p className="text-2xl font-bold text-accent">{estimatedPot.toLocaleString()} {sym}</p>
      </div>

      {/* General */}
      <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
        <h4 className="text-sm font-semibold text-content-primary mb-2">Groupe</h4>
        <SummaryRow label="Nom" value={formData.nom} />
        <SummaryRow label="Description" value={formData.description} />
        <SummaryRow label={`Cotisation (${sym})`} value={formData.montantCotisation} />
        <SummaryRow label="Membres" value={formData.nombreMembres} />
        <SummaryRow label="Frequence" value={findLabel(FREQUENCE_OPTIONS, formData.frequence)} />
        {formData.intervalleCotisation !== "1" && (
          <SummaryRow label="Intervalle" value={`x${formData.intervalleCotisation}`} />
        )}
        <SummaryRow label="Distribution" value={findLabel(DISTRIBUTION_TYPE_OPTIONS, formData.distributionType)} />
      </div>

      {/* Lifecycle */}
      <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
        <h4 className="text-xs font-semibold text-content-secondary mb-2">Cycle de vie</h4>
        <SummaryRow label="Date debut" value={formData.dateDebut} />
        {formData.dateFin && <SummaryRow label="Date fin" value={formData.dateFin} />}
        <SummaryRow label="Fin de cycle" value={findLabel(END_RULE_OPTIONS, formData.endRule)} />
        {formData.roundCount && <SummaryRow label="Nombre de tours" value={formData.roundCount} />}
        <SummaryRow label="Min membres" value={formData.minMembersToStart} />
      </div>

      {/* Members */}
      <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
        <h4 className="text-xs font-semibold text-content-secondary mb-2">
          Membres ({formData.members.length})
        </h4>
        {formData.members.length === 0 ? (
          <p className="text-xs text-content-muted">Aucun membre ajoute</p>
        ) : (
          <SummaryRow
            label="Inscrits"
            value={`${formData.members.length} / ${formData.nombreMembres}`}
          />
        )}
        <SummaryRow label="Ordre" value={findLabel(PAYOUT_ORDER_MODE_OPTIONS, formData.payoutOrderMode)} />
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Penalites</h4>
          <SummaryRow label="Actives" value={formData.penaltyEnabled ? "Oui" : "Non"} />
        </div>
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Paiement</h4>
          <SummaryRow label="Methodes" value={formData.allowedPaymentMethods.join(", ")} />
          {formData.tauxPlateforme !== "0" && (
            <SummaryRow label="Commission" value={`${formData.tauxPlateforme}%`} />
          )}
        </div>
      </div>

      {formData.planId && (
        <p className="text-[10px] text-content-muted text-center">
          Base sur un modele. Les regles non personnalisees sont heritees du modele.
        </p>
      )}
    </div>
  );
}
