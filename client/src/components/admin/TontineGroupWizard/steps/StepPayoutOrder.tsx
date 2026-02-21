import { useState, useMemo, useEffect } from "react";
import { GripVertical, Shuffle } from "lucide-react";
import type { StepComponentProps } from "../types";
import { clientApi } from "../../../../lib/api-client";
import { formatClientName } from "../../../../lib/format";

export default function StepPayoutOrder({ formData, updateField }: StepComponentProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    clientApi.getAllList()
      .then((data) => setClients(data || []))
      .catch(() => setClients([]));
  }, []);

  const orderedMembers = useMemo(() => {
    return formData.payoutOrder.map((id) => ({
      clientId: id,
      client: clients.find((c) => c.id === id),
    }));
  }, [formData.payoutOrder, clients]);

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    const newOrder = [...formData.payoutOrder];
    const [dragged] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(idx, 0, dragged);
    updateField("payoutOrder", newOrder);
    setDraggedIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const shuffle = () => {
    const shuffled = [...formData.payoutOrder].sort(() => Math.random() - 0.5);
    updateField("payoutOrder", shuffled);
  };

  if (formData.payoutOrderMode === "RANDOM_AT_START") {
    return (
      <div className="py-8 text-center space-y-3">
        <Shuffle className="w-10 h-10 text-accent mx-auto" />
        <p className="text-sm text-content-primary font-medium">Ordre aleatoire</p>
        <p className="text-xs text-content-muted">
          L'ordre de distribution sera determine aleatoirement au debut du cycle.
        </p>
      </div>
    );
  }

  if (formData.payoutOrderMode === "PRIORITY_SCORE") {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-sm text-content-primary font-medium">Ordre par score de priorite</p>
        <p className="text-xs text-content-muted">
          L'ordre sera determine par le score de priorite de chaque membre.
        </p>
      </div>
    );
  }

  if (formData.members.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-content-muted">
          Ajoutez des membres a l'etape precedente pour definir l'ordre de distribution.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-content-secondary">
          Glissez-deposez les membres pour definir l'ordre de distribution.
        </p>
        <button
          type="button"
          onClick={shuffle}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-subtle border border-edge-subtle text-content-secondary hover:text-content-primary transition-colors"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Melanger
        </button>
      </div>

      <div className="space-y-1.5">
        {orderedMembers.map(({ clientId, client }, idx) => (
          <div
            key={clientId}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
              draggedIdx === idx
                ? "border-accent bg-accent/5 shadow-lg"
                : "border-edge-subtle bg-input hover:border-edge"
            }`}
          >
            <GripVertical className="w-4 h-4 text-content-muted flex-shrink-0" />
            <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-content-primary truncate block">
                {client ? formatClientName(client.nom, client.prenom) : clientId}
              </span>
            </div>
            <span className="text-[10px] text-content-muted">Tour {idx + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
