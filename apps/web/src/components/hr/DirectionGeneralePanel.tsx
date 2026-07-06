import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, Plus, History, Trash2, Edit3, UserCheck, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import { toast } from '../../lib/toast';

interface GlobalRole {
  id: string;
  employeId: string;
  roleType: string;
  titre: string | null;
  dateDebut: string;
  dateFin: string | null;
  statut: string;
  employeNom: string;
  employePrenom: string;
  photoProfile: string | null;
  createdAt: string;
}

interface Employe {
  id: string;
  nom: string;
  prenom: string;
  poste?: string;
}

const ROLE_TYPES = [
  { value: 'PDG', label: 'Président Directeur Général' },
  { value: 'DGA', label: 'Directeur Général Adjoint' },
  { value: 'SECRETAIRE_GENERAL', label: 'Secrétaire Général' },
  { value: 'DIRECTEUR_FINANCIER', label: 'Directeur Financier' },
];

export default function DirectionGeneralePanel() {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ employeId: '', roleType: 'PDG', titre: '', dateDebut: new Date().toISOString().split('T')[0] });

  // Fetch active roles
  const { data: roles = [], isLoading } = useQuery<GlobalRole[]>({
    queryKey: ['direction-generale', showHistory],
    queryFn: async () => {
      const url = showHistory ? '/api/hr/direction-generale?history=true' : '/api/hr/direction-generale';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  // Fetch employees for selection
  const { data: employes = [] } = useQuery<Employe[]>({
    queryKey: ['employes-for-dg'],
    queryFn: async () => {
      const res = await fetch('/api/employes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map((e: any) => ({
        id: e.id,
        nom: e.user?.nom || e.nom || '',
        prenom: e.user?.prenom || e.prenom || '',
        poste: e.jobPosition?.name || e.poste || '',
      }));
    },
    enabled: showForm,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/hr/direction-generale', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, titre: data.titre || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['direction-generale'] });
      setShowForm(false);
      resetForm();
      toast.success('Rôle défini avec succès');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erreur lors de la création');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/direction-generale/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['direction-generale'] });
      toast.success('Rôle révoqué');
    },
    onError: () => {
      toast.error('Erreur lors de la révocation');
    },
  });

  function resetForm() {
    setForm({ employeId: '', roleType: 'PDG', titre: '', dateDebut: new Date().toISOString().split('T')[0] });
    setEditingId(null);
  }

  const activeRoles = roles.filter(r => r.statut === 'ACTIVE');
  const historicalRoles = roles.filter(r => r.statut !== 'ACTIVE');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Crown size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-content-primary">Direction Générale</h2>
            <p className="text-sm text-content-muted">Rôles organisationnels globaux (PDG, DGA, etc.)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(h => !h)}
          >
            <History size={14} className="mr-1.5" />
            {showHistory ? 'Actifs' : 'Historique'}
          </Button>
          <Button
            size="sm"
            onClick={() => { setShowForm(true); resetForm(); }}
          >
            <Plus size={14} className="mr-1.5" />
            Définir un rôle
          </Button>
        </div>
      </div>

      {/* Active Roles */}
      {activeRoles.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {activeRoles.map(role => (
            <div key={role.id} className="flex items-center gap-4 p-4 rounded-xl border border-edge bg-card">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg shrink-0">
                {role.photoProfile ? (
                  <img src={role.photoProfile} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  `${role.employeNom.charAt(0)}${role.employePrenom?.charAt(0) || ''}`
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-content-primary truncate">
                  {role.employePrenom} {role.employeNom}
                </div>
                <div className="text-sm text-accent font-medium">
                  {role.titre || ROLE_TYPES.find(r => r.value === role.roleType)?.label || role.roleType}
                </div>
                <div className="text-xs text-content-muted mt-0.5">
                  Depuis le {new Date(role.dateDebut).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] px-2 py-1 rounded-full bg-status-success-bg text-status-success font-medium">
                  Actif
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Révoquer le rôle de ${role.employePrenom} ${role.employeNom} ?`)) {
                      revokeMutation.mutate(role.id);
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-status-danger-bg text-content-muted hover:text-status-danger transition-colors"
                  title="Révoquer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeRoles.length === 0 && !showHistory && (
        <div className="text-center py-12 border border-dashed border-edge rounded-xl">
          <Crown size={40} className="mx-auto text-content-muted mb-3" />
          <p className="text-content-muted">Aucun rôle global défini</p>
          <p className="text-sm text-content-muted mt-1">Définissez un PDG pour qu'il apparaisse au sommet de l'organigramme</p>
        </div>
      )}

      {/* History */}
      {showHistory && historicalRoles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-content-secondary">Historique</h3>
          {historicalRoles.map(role => (
            <div key={role.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-subtle text-content-muted text-sm">
              <div className="w-8 h-8 rounded-full bg-surface-subtle-elevated flex items-center justify-center text-xs font-medium shrink-0">
                {role.employeNom.charAt(0)}{role.employePrenom?.charAt(0) || ''}
              </div>
              <div className="flex-1">
                <span className="font-medium">{role.employePrenom} {role.employeNom}</span>
                <span className="mx-1.5">-</span>
                <span>{role.titre || role.roleType}</span>
              </div>
              <div className="text-xs">
                {new Date(role.dateDebut).toLocaleDateString('fr-FR')}
                {role.dateFin && ` - ${new Date(role.dateFin).toLocaleDateString('fr-FR')}`}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-subtle-elevated">
                {role.statut === 'REVOKED' ? 'Révoqué' : role.statut}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="bg-surface-elevated rounded-2xl border border-edge shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-content-primary flex items-center gap-2">
              <UserCheck size={20} className="text-accent" />
              Définir un rôle global
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">Employé</label>
                <select
                  value={form.employeId}
                  onChange={e => setForm(f => ({ ...f, employeId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-input-border bg-input text-content-primary text-sm focus:border-input-focus focus:outline-none"
                >
                  <option value="">Sélectionner un employé...</option>
                  {employes.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.prenom} {emp.nom} {emp.poste ? `- ${emp.poste}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">Type de rôle</label>
                <select
                  value={form.roleType}
                  onChange={e => setForm(f => ({ ...f, roleType: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-input-border bg-input text-content-primary text-sm focus:border-input-focus focus:outline-none"
                >
                  {ROLE_TYPES.map(rt => (
                    <option key={rt.value} value={rt.value}>{rt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">Titre personnalisé (optionnel)</label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                  placeholder="Ex: Président Directeur Général"
                  className="w-full px-3 py-2 rounded-lg border border-input-border bg-input text-content-primary text-sm focus:border-input-focus focus:outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">Date de début</label>
                <input
                  type="date"
                  value={form.dateDebut}
                  onChange={e => setForm(f => ({ ...f, dateDebut: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-input-border bg-input text-content-primary text-sm focus:border-input-focus focus:outline-none"
                />
              </div>
            </div>

            {createMutation.isError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-status-danger-bg text-status-danger text-sm">
                <AlertCircle size={16} />
                {(createMutation.error as Error).message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={() => createMutation.mutate(form)}
                disabled={!form.employeId || createMutation.isPending}
              >
                {createMutation.isPending ? 'En cours...' : 'Définir le rôle'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
