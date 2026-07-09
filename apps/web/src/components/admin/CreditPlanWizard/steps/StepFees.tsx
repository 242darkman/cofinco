import type { StepComponentProps } from "../types";
import FeeEditor from "../components/FeeEditor";

export default function StepFees({ fees, setFees }: StepComponentProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-content-secondary">
        Configurez les différents frais applicables à ce plan de crédit.
        Chaque frais peut être un montant fixe ou un pourcentage du capital.
      </p>
      <FeeEditor fees={fees} setFees={setFees} />
    </div>
  );
}
