import { useState, useEffect } from "react";
import { LayoutTemplate, Check } from "lucide-react";
import type { StepComponentProps } from "../types";
import { tontinePlanApi } from "../../../../lib/api-client";
import { currencySymbol } from "@shared/config/currency";
import type { TontinePlan } from "@shared/schema/tontines";

interface StepTemplateProps extends StepComponentProps {
  onApplyPlan: (plan: Partial<TontinePlan> & { id: string }) => void;
}

export default function StepTemplate({ formData, onApplyPlan }: StepTemplateProps) {
  const [plans, setPlans] = useState<TontinePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const sym = currencySymbol();

  useEffect(() => {
    tontinePlanApi.getAll()
      .then((data) => setPlans((data || []).filter((p: TontinePlan) => p.actif)))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-content-muted py-8 text-center">Chargement des modeles...</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-content-secondary">
        Selectionnez un modele pour pre-remplir la configuration. Vous pourrez personnaliser les regles a l'etape 4.
      </p>

      {/* No template option */}
      <button
        type="button"
        onClick={() => onApplyPlan({ id: "" })}
        className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
          !formData.planId
            ? "border-accent bg-accent/5"
            : "border-input-border bg-input hover:border-edge"
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          !formData.planId ? "bg-accent text-white" : "bg-surface-subtle text-content-muted"
        }`}>
          <LayoutTemplate className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium text-content-primary">Sans modele</span>
          <p className="text-[10px] text-content-muted">Configuration manuelle de toutes les regles</p>
        </div>
        {!formData.planId && <Check className="w-4 h-4 text-accent" />}
      </button>

      {plans.length === 0 ? (
        <p className="text-xs text-content-muted text-center py-4">Aucun modele disponible</p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => onApplyPlan(plan)}
              className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
                formData.planId === plan.id
                  ? "border-accent bg-accent/5"
                  : "border-input-border bg-input hover:border-edge"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                formData.planId === plan.id ? "bg-accent text-white" : "bg-surface-subtle text-content-secondary"
              }`}>
                {plan.nom?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-content-primary">{plan.nom}</span>
                <p className="text-[10px] text-content-muted truncate">
                  {plan.montantCotisation ? `${Number(plan.montantCotisation).toLocaleString()} ${sym}` : ""}
                  {plan.nombreMembres ? ` · ${plan.nombreMembres} membres` : ""}
                  {plan.frequence ? ` · ${plan.frequence}` : ""}
                </p>
              </div>
              {formData.planId === plan.id && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
