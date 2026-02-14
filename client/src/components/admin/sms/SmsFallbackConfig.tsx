/**
 * SMS Fallback Provider Configuration
 * Configure automatic fallback when primary provider fails
 */

import React, { useState, useEffect } from 'react';
import {
  RefreshCcw,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Settings,
  Loader2,
  GripVertical,
} from 'lucide-react';
import { toast } from '../../../lib/toast';

export interface SmsProvider {
  id: string;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
  priority?: number;
}

export interface SmsFallbackConfigProps {
  providers: SmsProvider[];
  onSave: (config: FallbackConfig) => Promise<void>;
  loading?: boolean;
}

export interface FallbackConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelaySeconds: number;
  providerOrder: string[];
}

export default function SmsFallbackConfig({
  providers,
  onSave,
  loading = false,
}: SmsFallbackConfigProps) {
  const [enabled, setEnabled] = useState(true);
  const [maxRetries, setMaxRetries] = useState(2);
  const [retryDelaySeconds, setRetryDelaySeconds] = useState(5);
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const activeProviders = providers.filter((p) => p.isActive);

  useEffect(() => {
    // Initialize order based on priority or current order
    const sorted = [...activeProviders].sort(
      (a, b) => (a.priority || 0) - (b.priority || 0)
    );
    setProviderOrder(sorted.map((p) => p.id));
  }, [providers]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggingId && draggingId !== targetId) {
      const newOrder = [...providerOrder];
      const dragIndex = newOrder.indexOf(draggingId);
      const targetIndex = newOrder.indexOf(targetId);

      newOrder.splice(dragIndex, 1);
      newOrder.splice(targetIndex, 0, draggingId);

      setProviderOrder(newOrder);
    }
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        enabled,
        maxRetries,
        retryDelaySeconds,
        providerOrder,
      });
      toast.success('Configuration de fallback enregistrée');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const getProviderById = (id: string) => providers.find((p) => p.id === id);

  if (activeProviders.length < 2) {
    return (
      <div className="bg-surface/50 rounded-xl border border-edge p-6">
        <div className="flex items-center gap-3 text-status-warning">
          <AlertTriangle size={24} />
          <div>
            <h3 className="font-semibold">Configuration de fallback non disponible</h3>
            <p className="text-sm text-content-muted mt-1">
              Vous devez avoir au moins 2 providers actifs pour configurer le fallback automatique.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface/50 rounded-xl border border-edge overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-edge flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-status-info-bg rounded-lg">
            <RefreshCcw className="text-status-info" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-content-primary">Configuration Fallback</h3>
            <p className="text-sm text-content-muted">Basculement automatique entre providers</p>
          </div>
        </div>

        {/* Enable Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <span className="text-sm text-content-muted">Activé</span>
          <div
            className={`relative w-12 h-6 rounded-full transition ${
              enabled ? 'bg-status-info' : 'bg-surface-subtle'
            }`}
            onClick={() => setEnabled(!enabled)}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </div>
        </label>
      </div>

      {enabled && (
        <div className="p-4 space-y-6">
          {/* Provider Order */}
          <div>
            <h4 className="text-sm font-medium text-content-primary mb-3">Ordre de priorité</h4>
            <p className="text-xs text-content-muted mb-3">
              Glissez-déposez pour réorganiser. Le premier provider est utilisé en priorité.
            </p>

            <div className="space-y-2">
              {providerOrder.map((id, index) => {
                const provider = getProviderById(id);
                if (!provider) return null;

                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, id)}
                    onDragOver={(e) => handleDragOver(e, id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 bg-surface-elevated/50 rounded-lg border transition cursor-move ${
                      draggingId === id
                        ? 'border-status-info opacity-50'
                        : 'border-edge-strong hover:border-edge-strong'
                    }`}
                  >
                    <GripVertical className="text-content-muted" size={18} />

                    <span className="w-6 h-6 flex items-center justify-center bg-status-info-bg text-status-info rounded text-sm font-medium">
                      {index + 1}
                    </span>

                    <span className="flex-1 text-content-primary">{provider.name}</span>

                    {index === 0 && (
                      <span className="px-2 py-0.5 bg-status-success-bg text-status-success rounded text-xs">
                        Principal
                      </span>
                    )}

                    {index > 0 && (
                      <span className="text-xs text-content-muted">Fallback #{index}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Flow Diagram */}
          <div className="p-4 bg-surface-base/50 rounded-lg">
            <p className="text-xs text-content-muted mb-3">Flux de basculement</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {providerOrder.map((id, index) => {
                const provider = getProviderById(id);
                return (
                  <React.Fragment key={id}>
                    <div className="flex-shrink-0 px-3 py-2 bg-surface-elevated rounded-lg text-sm text-content-primary">
                      {provider?.name}
                    </div>
                    {index < providerOrder.length - 1 && (
                      <ArrowRight className="text-content-muted flex-shrink-0" size={18} />
                    )}
                  </React.Fragment>
                );
              })}
              <div className="flex-shrink-0 px-3 py-2 bg-status-danger-bg text-status-danger rounded-lg text-sm">
                Échec final
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-content-muted mb-2">
                Nombre max de tentatives
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-status-info"
              />
              <p className="mt-1 text-xs text-content-muted">Par provider avant basculement</p>
            </div>

            <div>
              <label className="block text-sm text-content-muted mb-2">
                Délai entre tentatives (sec)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={retryDelaySeconds}
                onChange={(e) => setRetryDelaySeconds(parseInt(e.target.value) || 5)}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-status-info"
              />
              <p className="mt-1 text-xs text-content-muted">Attente avant nouvelle tentative</p>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-status-info hover:bg-status-info text-white rounded-lg transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Enregistrement...
              </>
            ) : (
              <>
                <Settings size={18} />
                Enregistrer la configuration
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
