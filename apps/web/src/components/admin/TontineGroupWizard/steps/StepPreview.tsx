import { CalendarDays } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { StepComponentProps } from "../types";
import type { SchedulePreview } from "../../TontinePlanWizard/hooks/useSchedulePreview";

interface StepPreviewProps extends StepComponentProps {
  preview: SchedulePreview | null;
  previewLoading: boolean;
  previewError: string | null;
  onGeneratePreview: () => void;
}

export default function StepPreview({
  formData,
  preview,
  previewLoading,
  previewError,
  onGeneratePreview,
}: StepPreviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-content-secondary">
          Generez un apercu du calendrier de cotisations et distributions base sur la configuration actuelle.
        </p>
        <button
          type="button"
          onClick={onGeneratePreview}
          disabled={previewLoading}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {previewLoading ? (
            <Spinner size="xs" tone="current" />
          ) : (
            <CalendarDays className="w-3.5 h-3.5" />
          )}
          Generer l'apercu
        </button>
      </div>

      {previewError && (
        <p className="text-xs text-status-danger bg-status-danger-bg px-3 py-2 rounded-lg">{previewError}</p>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="flex gap-4 text-xs text-content-secondary bg-surface-subtle rounded-lg px-4 py-2.5">
            <span><strong>{preview.totalPeriods}</strong> periodes</span>
            <span><strong>{preview.totalRounds}</strong> tours</span>
            <span>Fin estimee : <strong>{preview.cycleEndDate}</strong></span>
          </div>

          <div className="max-h-72 overflow-y-auto border border-edge-subtle rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-subtle">
                <tr className="text-left text-content-muted">
                  <th className="px-3 py-2 border-b border-edge-subtle">#</th>
                  <th className="px-3 py-2 border-b border-edge-subtle">Date cotisation</th>
                  <th className="px-3 py-2 border-b border-edge-subtle">Date distribution</th>
                </tr>
              </thead>
              <tbody>
                {preview.contributions.map((c, i) => {
                  const payout = preview.payouts.find((p) => p.periodNumber === c.periodNumber);
                  return (
                    <tr key={i} className="border-b border-edge-subtle/50 hover:bg-surface-subtle/50">
                      <td className="px-3 py-2 text-content-muted">{c.periodNumber}</td>
                      <td className="px-3 py-2 text-content-primary">{c.dueDate}</td>
                      <td className="px-3 py-2 text-content-primary">{payout?.dueDate ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!preview && !previewError && !previewLoading && (
        <div className="py-12 text-center">
          <CalendarDays className="w-10 h-10 text-content-muted mx-auto mb-3" />
          <p className="text-sm text-content-muted">
            Cliquez sur "Generer l'apercu" pour voir le calendrier.
          </p>
        </div>
      )}
    </div>
  );
}
