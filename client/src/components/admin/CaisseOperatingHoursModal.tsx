import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Save, X, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Button, FormField } from '../ui';
import { caisseApi } from '../../lib/api-client';

interface CaisseOperatingHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  caisse: {
    id: string;
    nom: string;
    operatingHoursEnabled?: boolean;
    operatingHoursStart?: string;
    operatingHoursEnd?: string;
    operatingDays?: number[];
  } | null;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lundi', short: 'Lun' },
  { value: 2, label: 'Mardi', short: 'Mar' },
  { value: 3, label: 'Mercredi', short: 'Mer' },
  { value: 4, label: 'Jeudi', short: 'Jeu' },
  { value: 5, label: 'Vendredi', short: 'Ven' },
  { value: 6, label: 'Samedi', short: 'Sam' },
  { value: 0, label: 'Dimanche', short: 'Dim' },
];

export default function CaisseOperatingHoursModal({ isOpen, onClose, caisse }: CaisseOperatingHoursModalProps) {
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (caisse) {
      setEnabled(caisse.operatingHoursEnabled ?? false);
      setStartTime(caisse.operatingHoursStart ?? '08:00');
      setEndTime(caisse.operatingHoursEnd ?? '17:00');
      setSelectedDays(caisse.operatingDays ?? [1, 2, 3, 4, 5]);
    }
  }, [caisse]);

  const updateMutation = useMutation({
    mutationFn: async (data: {
      operatingHoursEnabled: boolean;
      operatingHoursStart: string;
      operatingHoursEnd: string;
      operatingDays: number[];
    }) => {
      if (!caisse) throw new Error('Caisse non trouvée');
      return caisseApi.updateOperatingHours(caisse.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caisses'] });
      toast.success('Horaires mis à jour');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.error || err.message || 'Erreur lors de la mise à jour');
    }
  });

  const handleDayToggle = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (enabled && selectedDays.length === 0) {
      toast.error('Sélectionnez au moins un jour d\'ouverture');
      return;
    }

    if (enabled && startTime >= endTime) {
      toast.error('L\'heure de fin doit être après l\'heure de début');
      return;
    }

    updateMutation.mutate({
      operatingHoursEnabled: enabled,
      operatingHoursStart: startTime,
      operatingHoursEnd: endTime,
      operatingDays: selectedDays,
    });
  };

  if (!caisse) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-status-info-bg rounded-xl">
            <Clock className="w-5 h-5 text-status-info" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-content-primary">Horaires d'accès</h2>
            <p className="text-sm text-content-muted">{caisse.nom}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-surface/50 rounded-xl border border-edge-subtle">
            <div>
              <div className="text-sm font-medium text-content-primary">Contrôle des horaires</div>
              <div className="text-xs text-content-muted mt-0.5">
                {enabled
                  ? 'Les utilisateurs doivent se connecter pendant les heures autorisées'
                  : 'La caisse est accessible à tout moment'
                }
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                enabled ? 'bg-status-info' : 'bg-surface-subtle'
              }`}
            >
              <span
                className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                  enabled ? 'left-6' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {enabled && (
            <>
              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-content-muted uppercase tracking-wide">
                    Heure d'ouverture
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface/50 border border-edge-subtle rounded-xl text-content-primary text-sm focus:outline-none focus:border-status-info"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-content-muted uppercase tracking-wide">
                    Heure de fermeture
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface/50 border border-edge-subtle rounded-xl text-content-primary text-sm focus:outline-none focus:border-status-info"
                  />
                </div>
              </div>

              {/* Days of Week */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-content-muted uppercase tracking-wide">
                  <Calendar className="w-3.5 h-3.5" />
                  Jours d'ouverture
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => handleDayToggle(day.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        selectedDays.includes(day.value)
                          ? 'bg-status-info text-white shadow-sm shadow-status-info/30'
                          : 'bg-surface/50 text-content-muted border border-edge-subtle hover:border-edge-strong'
                      }`}
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-content-muted">
                  {selectedDays.length === 0
                    ? 'Aucun jour sélectionné'
                    : `${selectedDays.length} jour${selectedDays.length > 1 ? 's' : ''} sélectionné${selectedDays.length > 1 ? 's' : ''}`
                  }
                </p>
              </div>

              {/* Info Banner */}
              <div className="bg-status-warning-bg border border-status-warning/30 rounded-xl p-4">
                <div className="flex gap-3">
                  <Clock className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
                  <div className="text-sm text-status-warning-text/80">
                    <p className="font-medium text-status-warning">Important</p>
                    <p className="mt-1">
                      Hors des heures autorisées, les utilisateurs devront entrer un code de sécurité
                      pour accéder à la caisse. Les codes sont générés par les administrateurs ou chefs d'agence.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-edge-subtle">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-content-muted"
            >
              <X className="w-4 h-4 mr-1.5" />
              Annuler
            </Button>
            <Button
              type="submit"
              isLoading={updateMutation.isPending}
              className="bg-status-info hover:bg-status-info"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
