import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../../../ui";
import type { FeeFormRow } from "../types";
import {
  EMPTY_FEE,
  FEE_TYPE_OPTIONS,
  FEE_CALC_TYPE_OPTIONS,
  FEE_COLLECTION_MODE_OPTIONS,
} from "../constants";
import { currencySymbol } from "@shared/config/currency";

interface FeeEditorProps {
  fees: FeeFormRow[];
  setFees: Dispatch<SetStateAction<FeeFormRow[]>>;
}

export default function FeeEditor({ fees, setFees }: FeeEditorProps) {
  const sym = currencySymbol();
  const addFee = () => setFees((prev) => [...prev, { ...EMPTY_FEE }]);

  const removeFee = (index: number) => setFees((prev) => prev.filter((_, i) => i !== index));

  const updateFee = (index: number, key: string, value: any) => {
    setFees((prev) => prev.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  };

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {fees.length === 0 && (
        <p className="text-content-muted text-sm text-center py-4">
          Aucun frais configuré. Cliquez sur «&nbsp;Ajouter un frais&nbsp;» pour commencer.
        </p>
      )}

      {fees.map((fee, idx) => (
        <div key={idx} className="bg-surface-subtle rounded-lg p-4 border border-edge-subtle space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-content-primary">
              Frais #{idx + 1}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                className="text-content-muted hover:text-content-primary transition-colors p-1"
                title="Options avancées"
              >
                {expandedIdx === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <button
                onClick={() => removeFee(idx)}
                className="text-content-muted hover:text-status-danger transition-colors p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-content-secondary mb-1">Type</label>
              <select
                value={fee.feeType}
                onChange={(e) => updateFee(idx, "feeType", e.target.value)}
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {FEE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-content-secondary mb-1">Libellé</label>
              <input
                type="text"
                value={fee.label}
                onChange={(e) => updateFee(idx, "label", e.target.value)}
                placeholder="Nom personnalisé"
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-content-secondary mb-1">Mode de calcul</label>
              <select
                value={fee.calcType}
                onChange={(e) => updateFee(idx, "calcType", e.target.value)}
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {FEE_CALC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-content-secondary mb-1">
                {fee.calcType === "PERCENTAGE" ? "Pourcentage (%)" : "Montant"}
              </label>
              <input
                type="number"
                value={fee.value}
                onChange={(e) => updateFee(idx, "value", e.target.value)}
                placeholder={fee.calcType === "PERCENTAGE" ? "Ex : 5" : "Ex : 10000"}
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-content-secondary mb-1">Prélèvement</label>
              <select
                value={fee.collectionMode}
                onChange={(e) => updateFee(idx, "collectionMode", e.target.value)}
                className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {FEE_COLLECTION_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={fee.isRefundable}
                onChange={(e) => updateFee(idx, "isRefundable", e.target.checked)}
                className="rounded border-input-border"
              />
              <label className="text-xs text-content-secondary">Remboursable</label>
            </div>
          </div>

          {/* Advanced fields */}
          {expandedIdx === idx && (
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-edge-subtle">
              <div>
                <label className="block text-xs text-content-secondary mb-1">Min ({sym})</label>
                <input
                  type="number"
                  value={fee.minAmount}
                  onChange={(e) => updateFee(idx, "minAmount", e.target.value)}
                  placeholder="Optionnel"
                  className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-content-secondary mb-1">Max ({sym})</label>
                <input
                  type="number"
                  value={fee.maxAmount}
                  onChange={(e) => updateFee(idx, "maxAmount", e.target.value)}
                  placeholder="Optionnel"
                  className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-content-secondary mb-1">Code comptable</label>
                <input
                  type="text"
                  value={fee.accountingCode}
                  onChange={(e) => updateFee(idx, "accountingCode", e.target.value)}
                  placeholder="Ex : 706100"
                  className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <Button variant="ghost" size="sm" icon={Plus} onClick={addFee} className="w-full">
        Ajouter un frais
      </Button>
    </div>
  );
}
