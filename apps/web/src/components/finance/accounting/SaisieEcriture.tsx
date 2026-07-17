import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Save, Check, X, Search, Calculator, FileText, Calendar, AlertTriangle } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { comptabiliteApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface Compte {
  id: string;
  numeroCompte: string;
  intitule: string;
  sensNormal: 'Débit' | 'Crédit';
}

interface Journal {
  id: string;
  code: string;
  intitule: string;
}

interface LigneEcriture {
  id?: string;
  compte_id: string;
  numero_compte: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
}

interface SaisieEcritureProps {
  onSuccess?: () => void;
}

export default function SaisieEcriture({ onSuccess }: SaisieEcritureProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateEcritures = hasPermission('comptabilite', 'create') || hasPermission('ecritures', 'create');

  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [filteredComptes, setFilteredComptes] = useState<Compte[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompteSearch, setShowCompteSearch] = useState<number | null>(null);

  const [form, setForm] = useState({
    journalCode: '',
    date_ecriture: new Date().toISOString().split('T')[0],
    libelle: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const [lignes, setLignes] = useState<LigneEcriture[]>([
    { compte_id: '', numero_compte: '', intitule: '', libelle: '', debit: 0, credit: 0 },
    { compte_id: '', numero_compte: '', intitule: '', libelle: '', debit: 0, credit: 0 }
  ]);

  const fetchJournaux = useCallback(async () => {
    try {
      const data = await comptabiliteApi.getJournaux();
      setJournaux(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des journaux'));
      setJournaux([]);
    }
  }, []);

  const fetchComptes = useCallback(async () => {
    try {
      const data = await comptabiliteApi.getPlanOhada();
      setComptes(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des comptes'));
      setComptes([]);
    }
  }, []);

  useEffect(() => {
    fetchJournaux();
    fetchComptes();
  }, [fetchJournaux, fetchComptes]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = comptes.filter(c =>
        c.numeroCompte.includes(searchTerm) ||
        c.intitule.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredComptes(filtered);
    } else {
      setFilteredComptes(comptes);
    }
  }, [searchTerm, comptes]);

  const addLigne = () => {
    setLignes([...lignes, { compte_id: '', numero_compte: '', intitule: '', libelle: '', debit: 0, credit: 0 }]);
  };

  const removeLigne = (index: number) => {
    if (lignes.length > 2) {
      setLignes(lignes.filter((_, i) => i !== index));
    }
  };

  const updateLigne = (index: number, field: keyof LigneEcriture, value: any) => {
    const newLignes = [...lignes];
    newLignes[index] = { ...newLignes[index], [field]: value };
    setLignes(newLignes);
  };

  const selectCompte = (index: number, compte: Compte) => {
    updateLigne(index, 'compte_id', compte.id);
    updateLigne(index, 'numero_compte', compte.numeroCompte);
    updateLigne(index, 'intitule', compte.intitule);
    setShowCompteSearch(null);
    setSearchTerm('');
  };

  const totalDebit = lignes.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lignes.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isEquilibre = totalDebit === totalCredit && totalDebit > 0;

  const formatCompact = (montant: number) => {
    if (montant >= 1000000) return (montant / 1000000).toFixed(1) + 'M';
    if (montant >= 1000) return (montant / 1000).toFixed(1) + 'K';
    return montant.toFixed(2);
  };

  const handleSubmit = useCallback(async () => {
    if (!isEquilibre) {
      toast.warning('Écriture déséquilibrée ! Débit doit être égal au Crédit.');
      return;
    }

    if (!form.journalCode) {
      toast.warning('Veuillez sélectionner un journal.');
      return;
    }

    if (!form.libelle.trim()) {
      toast.warning('Veuillez saisir un libellé.');
      return;
    }

    const lignesValides = lignes.filter(l => l.numero_compte && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (lignesValides.length < 2) {
      toast.warning('Minimum 2 lignes avec un compte et un montant.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await comptabiliteApi.createEntry({
        journalCode: form.journalCode,
        dateEcriture: form.date_ecriture,
        libelle: form.libelle,
        lignes: lignesValides.map(l => ({
          numeroCompte: l.numero_compte,
          compteId: l.compte_id || undefined,
          libelle: l.libelle || form.libelle,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0
        }))
      });

      toast.success(`Écriture ${result.numeroPiece} créée et postée au GL`);

      setForm({
        journalCode: '',
        date_ecriture: new Date().toISOString().split('T')[0],
        libelle: ''
      });
      setLignes([
        { compte_id: '', numero_compte: '', intitule: '', libelle: '', debit: 0, credit: 0 },
        { compte_id: '', numero_compte: '', intitule: '', libelle: '', debit: 0, credit: 0 }
      ]);

      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de la création de l'écriture"));
    } finally {
      setSubmitting(false);
    }
  }, [isEquilibre, lignes, form, onSuccess]);

  return (
    <div className="space-y-3">
      {/* Header compact - UNE SEULE LIGNE */}
      <div className="bg-surface border border-edge rounded-xl p-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 overflow-x-auto w-full">
          {/* Titre */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="p-2.5 bg-accent/10 border border-accent/20 rounded-xl">
              <Calculator className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-content-primary leading-tight whitespace-nowrap">Saisie d'Écriture</h2>
              <p className="text-[10px] text-content-muted whitespace-nowrap">Opérations comptables</p>
            </div>
          </div>

          {/* Séparateur */}
          <div className="w-px h-10 bg-edge flex-shrink-0 mx-2" />

          {/* Stats inline */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-surface-elevated border border-edge rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-content-primary leading-none">
                  {formatCompact(totalDebit)}
                </div>
                <div className="text-[9px] text-content-muted uppercase font-medium">Débit</div>
              </div>
            </div>
            <div className="bg-surface-elevated border border-edge rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-content-primary leading-none">
                  {formatCompact(totalCredit)}
                </div>
                <div className="text-[9px] text-content-muted uppercase font-medium">Crédit</div>
              </div>
            </div>
            <div className="bg-surface-elevated border border-edge rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-content-primary leading-none">
                  {lignes.filter(l => l.compte_id).length}
                </div>
                <div className="text-[9px] text-content-muted uppercase font-medium">Lignes</div>
              </div>
            </div>
          </div>

          {/* Indicateur équilibre */}
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 flex items-center gap-1 ${
            isEquilibre
              ? 'bg-status-success/10 text-status-success border border-status-success/20'
              : 'bg-status-danger/10 text-status-danger border border-status-danger/20'
          }`}>
            {isEquilibre ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {isEquilibre ? 'Équilibrée' : 'Écart: ' + Math.abs(totalDebit - totalCredit).toFixed(2)}
          </div>

          {/* Spacer */}
          <div className="flex-1 min-w-4" />

          {/* Action principale */}
          {canCreateEcritures ? (
            <button
              onClick={handleSubmit}
              disabled={!isEquilibre || submitting}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all flex-shrink-0 shadow-xs ${
                isEquilibre && !submitting
                  ? 'bg-accent hover:bg-accent/90 text-white'
                  : 'bg-surface-elevated border border-edge text-content-muted cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Enregistrement...' : 'Enregistrer & Poster'}</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 bg-status-warning-bg border border-status-warning/20 text-status-warning rounded-lg text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Permission requise
            </div>
          )}
        </div>
      </div>

      {/* Formulaire compact */}
      <div className="bg-surface rounded-xl p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Journal */}
          <div className="flex-1 min-w-[150px] max-w-[220px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1">Journal *</label>
            <select
              value={form.journalCode}
              onChange={(e) => setForm({ ...form, journalCode: e.target.value })}
              className="w-full bg-surface-elevated text-content-primary text-xs px-3 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-1 focus:ring-status-info"
              required
            >
              <option value="">Sélectionner...</option>
              {journaux.map(j => (
                <option key={j.id} value={j.code}>{j.code} - {j.intitule}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="flex-1 min-w-[130px] max-w-[150px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1">Date *</label>
            <input
              type="date"
              value={form.date_ecriture}
              onChange={(e) => setForm({ ...form, date_ecriture: e.target.value })}
              className="w-full bg-surface-elevated text-content-primary text-xs px-3 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-1 focus:ring-status-info"
              required
            />
          </div>

          {/* Libellé - prend plus de place */}
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1">Libellé *</label>
            <input
              type="text"
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              className="w-full bg-surface-elevated text-content-primary text-xs px-3 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-1 focus:ring-status-info"
              placeholder="Description de l'opération"
              required
            />
          </div>
        </div>
      </div>

      {/* Lignes d'écriture */}
      <div className="bg-surface rounded-xl overflow-hidden">
        {/* Header des lignes */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-edge">
          <h3 className="text-xs font-bold text-content-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-status-info" />
            Lignes d'Écriture
          </h3>
          <button
            onClick={addLigne}
            className="px-3 py-1.5 bg-status-info hover:bg-status-info text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        </div>

        {/* Tableau des lignes */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-muted w-36">N° Compte</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">Intitulé</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-muted hidden md:table-cell">Libellé</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-content-muted w-28">Débit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-content-muted w-28">Crédit</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-content-muted w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/50">
              {lignes.map((ligne, index) => (
                <tr key={index} className="hover:bg-surface-elevated/30 transition-colors">
                  {/* N° Compte avec recherche */}
                  <td className="px-3 py-2 relative">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={ligne.numero_compte}
                        onChange={(e) => {
                          updateLigne(index, 'numero_compte', e.target.value);
                          setSearchTerm(e.target.value);
                          setShowCompteSearch(index);
                        }}
                        className="w-20 bg-surface-subtle text-content-primary text-xs px-2 py-1.5 rounded-lg"
                        placeholder="Compte"
                      />
                      <button
                        onClick={() => setShowCompteSearch(showCompteSearch === index ? null : index)}
                        className="p-1.5 bg-surface-subtle hover:bg-surface-muted0 rounded-lg transition-colors"
                      >
                        <Search className="w-3 h-3 text-content-secondary" />
                      </button>
                    </div>
                    
                    {/* Dropdown recherche compte */}
                    {showCompteSearch === index && (
                      <div className="absolute z-20 left-0 mt-1 w-80 bg-surface-elevated border border-edge-strong rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {filteredComptes.slice(0, 15).map(compte => (
                          <button
                            key={compte.id}
                            onClick={() => selectCompte(index, compte)}
                            className="w-full px-3 py-2 text-left hover:bg-surface-subtle flex items-center gap-2 text-xs transition-colors"
                          >
                            <span className="text-accent font-mono font-bold">{compte.numeroCompte}</span>
                            <span className="text-content-primary truncate">{compte.intitule}</span>
                          </button>
                        ))}
                        {filteredComptes.length === 0 && (
                          <div className="px-3 py-2 text-content-muted text-xs">Aucun compte trouvé</div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Intitulé */}
                  <td className="px-3 py-2 text-content-primary text-xs truncate max-w-[150px]">
                    {ligne.intitule || <span className="text-content-muted">-</span>}
                  </td>

                  {/* Libellé spécifique */}
                  <td className="px-3 py-2 hidden md:table-cell">
                    <input
                      type="text"
                      value={ligne.libelle}
                      onChange={(e) => updateLigne(index, 'libelle', e.target.value)}
                      className="w-full bg-surface-subtle text-content-primary text-xs px-2 py-1.5 rounded-lg"
                      placeholder="Libellé..."
                    />
                  </td>

                  {/* Débit */}
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={ligne.debit || ''}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateLigne(index, 'debit', v); }}
                      className="w-full bg-surface-subtle text-content-primary text-xs px-2 py-1.5 rounded-lg text-right font-mono"
                      placeholder="0"
                    />
                  </td>

                  {/* Crédit */}
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={ligne.credit || ''}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateLigne(index, 'credit', v); }}
                      className="w-full bg-surface-subtle text-content-primary text-xs px-2 py-1.5 rounded-lg text-right font-mono"
                      placeholder="0"
                    />
                  </td>

                  {/* Action supprimer */}
                  <td className="px-3 py-2 text-center">
                    {lignes.length > 2 && (
                      <button
                        onClick={() => removeLigne(index)}
                        className="p-1.5 hover:bg-status-danger-bg text-status-danger rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Footer avec totaux */}
            <tfoot className="bg-surface-elevated">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-bold text-content-primary text-xs hidden md:table-cell">
                  TOTAUX
                </td>
                <td colSpan={2} className="px-3 py-2 text-right font-bold text-content-primary text-xs md:hidden">
                  TOTAUX
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-sm font-bold text-status-success font-mono">{totalDebit.toFixed(2)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-sm font-bold text-accent font-mono">{totalCredit.toFixed(2)}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  {isEquilibre ? (
                    <Check className="w-4 h-4 text-status-success mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-status-warning mx-auto" />
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Barre d'état en bas */}
        <div className={`px-3 py-2 flex items-center justify-between border-t ${
          isEquilibre
            ? 'bg-status-success-bg border-status-success/30'
            : 'bg-status-warning-bg border-status-warning/30'
        }`}>
          <div className="flex items-center gap-2">
            <Calculator className={`w-4 h-4 ${isEquilibre ? 'text-status-success' : 'text-status-warning'}`} />
            <span className={`text-xs font-medium ${isEquilibre ? 'text-status-success' : 'text-status-warning'}`}>
              {isEquilibre ? 'Écriture Équilibrée ✓' : `Écart: ${Math.abs(totalDebit - totalCredit).toFixed(2)} FCFA`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-content-muted">Montant total</span>
            <span className="text-sm font-bold text-content-primary ml-2">{totalDebit.toFixed(2)} FCFA</span>
          </div>
        </div>
      </div>

      {/* Bouton d'enregistrement mobile (visible uniquement si pas dans le header) */}
      {canCreateEcritures && (
        <div className="md:hidden">
          <button
            onClick={handleSubmit}
            disabled={!isEquilibre || submitting}
            className={`w-full px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
              isEquilibre && !submitting
                ? 'bg-status-success text-white'
                : 'bg-surface-elevated text-content-muted cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            {submitting ? 'Enregistrement...' : 'Enregistrer & Poster au GL'}
          </button>
        </div>
      )}
    </div>
  );
}