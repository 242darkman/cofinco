import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "../../../ui";
import { formatMoney, currencySymbol } from "@shared/config/currency";
import type { PreviewResult } from "../hooks/useSchedulePreview";
import type { CreditPlanFormData, FeeFormRow } from "../types";

interface SchedulePreviewProps {
  formData: CreditPlanFormData;
  fees: FeeFormRow[];
  preview: PreviewResult | null;
  loading: boolean;
  error: string | null;
  onGenerate: (
    formData: CreditPlanFormData,
    fees: FeeFormRow[],
    principal: string,
    disbursementDate: string,
  ) => Promise<void>;
}

export default function SchedulePreview({
  formData,
  fees,
  preview,
  loading,
  error,
  onGenerate,
}: SchedulePreviewProps) {
  const [principal, setPrincipal] = useState("500000");
  const [disbursementDate, setDisbursementDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const handleGenerate = () => {
    onGenerate(formData, fees, principal, disbursementDate);
  };

  const sym = currencySymbol();

  return (
    <div className="space-y-4">
      {/* Paramètres de preview */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs text-content-secondary mb-1">
            Montant test ({sym})
          </label>
          <input
            type="number"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-content-secondary mb-1">Date de décaissement</label>
          <input
            type="date"
            value={disbursementDate}
            onChange={(e) => setDisbursementDate(e.target.value)}
            className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Play}
          onClick={handleGenerate}
          disabled={loading || !principal}
          isLoading={loading}
        >
          Générer
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-status-danger-bg text-status-danger rounded-lg text-sm">{error}</div>
      )}

      {preview && (
        <>
          {/* Résumé */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Capital", value: preview.summary.totalCapital },
              { label: "Intérêts", value: preview.summary.totalInterest },
              { label: "Frais", value: preview.summary.totalFees },
              { label: "Coût total", value: preview.summary.totalDue },
            ].map((item) => (
              <div key={item.label} className="bg-surface-subtle rounded-lg p-3 text-center">
                <div className="text-xs text-content-muted mb-1">{item.label}</div>
                <div className="text-sm font-semibold text-content-primary">
                  {formatMoney(item.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-content-muted text-center">
            {preview.summary.numberOfInstallments} échéances
            {preview.upfrontFees.length > 0 && (
              <> &mdash; Frais préalables : {preview.upfrontFees.map(f => formatMoney(f.amount)).join(", ")}</>
            )}
          </div>

          {/* Tableau */}
          <div className="max-h-[300px] overflow-auto border border-edge-subtle rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-surface-subtle sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-content-secondary">#</th>
                  <th className="px-3 py-2 text-left text-content-secondary">Date</th>
                  <th className="px-3 py-2 text-right text-content-secondary">Capital</th>
                  <th className="px-3 py-2 text-right text-content-secondary">Intérêt</th>
                  <th className="px-3 py-2 text-right text-content-secondary">Frais</th>
                  <th className="px-3 py-2 text-right text-content-secondary">Total</th>
                  <th className="px-3 py-2 text-right text-content-secondary">Solde</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.number} className="border-t border-edge-subtle hover:bg-surface-subtle/50">
                    <td className="px-3 py-1.5 text-content-muted">{row.number}</td>
                    <td className="px-3 py-1.5 text-content-primary">{row.date}</td>
                    <td className="px-3 py-1.5 text-right text-content-primary">
                      {formatMoney(row.capitalPayment, { showCurrency: false })}
                    </td>
                    <td className="px-3 py-1.5 text-right text-content-secondary">
                      {formatMoney(row.interestPayment, { showCurrency: false })}
                    </td>
                    <td className="px-3 py-1.5 text-right text-content-muted">
                      {formatMoney(row.feePayment, { showCurrency: false })}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium text-content-primary">
                      {formatMoney(row.totalPayment, { showCurrency: false })}
                    </td>
                    <td className="px-3 py-1.5 text-right text-content-secondary">
                      {formatMoney(row.balanceAfter, { showCurrency: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
