import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Modal, FormField, SelectField, StatCard } from '../ui';
import { Plus, Calendar, CheckCircle, Clock, FileText } from 'lucide-react';
import { toast } from '../../lib/toast';

interface CongeItem {
  id: number;
  type: string;
  dateDebut: string;
  dateFin: string;
  motif?: string;
  statut: string;
  commentaire?: string;
  createdAt: string;
  dureeJours?: number;
}

const TYPE_OPTIONS = [
  { value: 'ANNUEL', label: 'Conge annuel' },
  { value: 'MALADIE', label: 'Conge maladie' },
  { value: 'MATERNITE', label: 'Conge maternite' },
  { value: 'SANS_SOLDE', label: 'Sans solde' },
];

const TYPE_LABELS: Record<string, string> = {
  ANNUEL: 'Annuel',
  MALADIE: 'Maladie',
  MATERNITE: 'Maternite',
  SANS_SOLDE: 'Sans solde',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function computeDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diff, 0);
}

export default function MesCongesTab() {
  const queryClient = useQueryClient();

  const { data: conges = [], isLoading } = useQuery<CongeItem[]>({
    queryKey: ['/api/hr/conges/my'],
    queryFn: () =>
      fetch('/api/hr/conges?mine=true', { credentials: 'include' }).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; dateDebut: string; dateFin: string; motif?: string }) =>
      fetch('/api/hr/conges', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('Erreur lors de la creation');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/conges/my'] });
      toast.success('Demande de conge envoyee');
      setShowModal(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState('');
  const [formDateDebut, setFormDateDebut] = useState('');
  const [formDateFin, setFormDateFin] = useState('');
  const [formMotif, setFormMotif] = useState('');

  const resetForm = useCallback(() => {
    setFormType('');
    setFormDateDebut('');
    setFormDateFin('');
    setFormMotif('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (!formType || !formDateDebut || !formDateFin) {
      toast.warning('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (new Date(formDateFin) < new Date(formDateDebut)) {
      toast.warning('La date de fin doit etre apres la date de debut');
      return;
    }
    createMutation.mutate({
      type: formType,
      dateDebut: formDateDebut,
      dateFin: formDateFin,
      motif: formMotif || undefined,
    });
  }, [formType, formDateDebut, formDateFin, formMotif, createMutation]);

  // Compute balance stats
  const enAttente = conges.filter((c) => c.statut === 'PENDING' || c.statut === 'EN_ATTENTE').length;
  const approuves = conges.filter((c) => c.statut === 'APPROVED' || c.statut === 'APPROUVE').length;
  const totalJoursPris = conges
    .filter((c) => c.statut === 'APPROVED' || c.statut === 'APPROUVE')
    .reduce((sum, c) => sum + (c.dureeJours || computeDays(c.dateDebut, c.dateFin)), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <StatCard
          title="En attente"
          value={enAttente}
          icon={Clock}
          color="warning"
        />
        <StatCard
          title="Conges approuves"
          value={approuves}
          icon={CheckCircle}
          color="success"
        />
        <StatCard
          title="Jours pris"
          value={totalJoursPris}
          icon={Calendar}
          color="primary"
        />
      </div>

      {/* Header with new request button */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-content-primary">Historique des congés</h3>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowModal(true)}>
          Nouvelle demande
        </Button>
      </div>

      {/* History */}
      {conges.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="h-10 w-10 text-content-muted mb-3" />
            <p className="text-content-secondary font-medium">Aucun congé</p>
            <p className="text-sm text-content-muted mt-1">
              Vous n'avez pas encore de demandes de congés
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {conges.map((conge) => {
            const duree = conge.dureeJours || computeDays(conge.dateDebut, conge.dateFin);
            return (
              <Card key={conge.id} padding="sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="hidden sm:flex shrink-0 items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                      <Calendar className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-content-primary text-sm">
                          {TYPE_LABELS[conge.type] || conge.type}
                        </span>
                        <Badge value={conge.statut} size="sm" />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-content-muted flex-wrap">
                        <span>
                          Du {formatDate(conge.dateDebut)} au {formatDate(conge.dateFin)}
                        </span>
                        <span className="font-medium text-content-secondary">
                          {duree} jour{duree > 1 ? 's' : ''}
                        </span>
                      </div>
                      {conge.motif && (
                        <p className="text-xs text-content-muted mt-1 truncate max-w-md">
                          {conge.motif}
                        </p>
                      )}
                      {conge.commentaire && (
                        <p className="text-xs text-content-muted mt-1 italic">
                          RH: {conge.commentaire}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-content-muted shrink-0">
                    {formatDate(conge.createdAt)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create leave modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title="Nouvelle demande de conge"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={createMutation.isPending}
            >
              Envoyer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <SelectField
            label="Type de conge"
            name="typeConge"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            options={TYPE_OPTIONS}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Date de debut"
              name="dateDebut"
              type="date"
              value={formDateDebut}
              onChange={(e) => setFormDateDebut(e.target.value)}
              required
            />
            <FormField
              label="Date de fin"
              name="dateFin"
              type="date"
              value={formDateFin}
              onChange={(e) => setFormDateFin(e.target.value)}
              required
            />
          </div>
          {formDateDebut && formDateFin && new Date(formDateFin) >= new Date(formDateDebut) && (
            <p className="text-sm text-content-secondary">
              Duree: <span className="font-semibold text-content-primary">{computeDays(formDateDebut, formDateFin)} jour(s)</span>
            </p>
          )}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
              Motif
            </label>
            <textarea
              value={formMotif}
              onChange={(e) => setFormMotif(e.target.value)}
              placeholder="Raison de la demande (optionnel)"
              rows={3}
              className="w-full px-4 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
