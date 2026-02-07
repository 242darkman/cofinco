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
      <div className="bg-gradient-to-r from-blue-600 to-emerald-600 rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* Titre */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Calculator className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Saisie d'Écriture</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Opérations comptables</p>
            </div>
          </div>

          {/* Séparateur */}
          <div className="w-px h-10 bg-white/20 flex-shrink-0" />

          {/* Stats inline */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-green-300 leading-none">
                  {formatCompact(totalDebit)}
                </div>
                <div className="text-[9px] text-white/70">Débit</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-cyan-300 leading-none">
                  {formatCompact(totalCredit)}
                </div>
                <div className="text-[9px] text-white/70">Crédit</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-white leading-none">
                  {lignes.filter(l => l.compte_id).length}
                </div>
                <div className="text-[9px] text-white/70">Lignes</div>
              </div>
            </div>
          </div>

          {/* Indicateur équilibre */}
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 flex items-center gap-1 ${
            isEquilibre 
              ? 'bg-green-400/30 text-green-200' 
              : 'bg-amber-400/30 text-amber-200'
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
              className={`px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors flex-shrink-0 ${
                isEquilibre && !submitting
                  ? 'bg-white/20 hover:bg-white/30 text-white'
                  : 'bg-white/10 text-white/50 cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Enregistrement...' : 'Enregistrer & Poster'}</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-lg text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Permission requise
            </div>
          )}
        </div>
      </div>

      {/* Formulaire compact */}
      <div className="bg-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Journal */}
          <div className="flex-1 min-w-[150px] max-w-[220px]">
            <label className="block text-[10px] font-medium text-slate-400 mb-1">Journal *</label>
            <select
              value={form.journalCode}
              onChange={(e) => setForm({ ...form, journalCode: e.target.value })}
              className="w-full bg-slate-700 text-white text-xs px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            <label className="block text-[10px] font-medium text-slate-400 mb-1">Date *</label>
            <input
              type="date"
              value={form.date_ecriture}
              onChange={(e) => setForm({ ...form, date_ecriture: e.target.value })}
              className="w-full bg-slate-700 text-white text-xs px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Libellé - prend plus de place */}
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-[10px] font-medium text-slate-400 mb-1">Libellé *</label>
            <input
              type="text"
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              className="w-full bg-slate-700 text-white text-xs px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Description de l'opération"
              required
            />
          </div>
        </div>
      </div>

      {/* Lignes d'écriture */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        {/* Header des lignes */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            Lignes d'Écriture
          </h3>
          <button
            onClick={addLigne}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        </div>

        {/* Tableau des lignes */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 w-36">N° Compte</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Intitulé</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 hidden md:table-cell">Libellé</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 w-28">Débit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 w-28">Crédit</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {lignes.map((ligne, index) => (
                <tr key={index} className="hover:bg-slate-700/30 transition-colors">
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
                        className="w-20 bg-slate-600 text-white text-xs px-2 py-1.5 rounded-lg"
                        placeholder="Compte"
                      />
                      <button
                        onClick={() => setShowCompteSearch(showCompteSearch === index ? null : index)}
                        className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                      >
                        <Search className="w-3 h-3 text-slate-300" />
                      </button>
                    </div>
                    
                    {/* Dropdown recherche compte */}
                    {showCompteSearch === index && (
                      <div className="absolute z-20 left-0 mt-1 w-80 bg-slate-700 border border-slate-600 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {filteredComptes.slice(0, 15).map(compte => (
                          <button
                            key={compte.id}
                            onClick={() => selectCompte(index, compte)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-600 flex items-center gap-2 text-xs transition-colors"
                          >
                            <span className="text-cyan-400 font-mono font-bold">{compte.numeroCompte}</span>
                            <span className="text-white truncate">{compte.intitule}</span>
                          </button>
                        ))}
                        {filteredComptes.length === 0 && (
                          <div className="px-3 py-2 text-slate-400 text-xs">Aucun compte trouvé</div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Intitulé */}
                  <td className="px-3 py-2 text-white text-xs truncate max-w-[150px]">
                    {ligne.intitule || <span className="text-slate-500">-</span>}
                  </td>

                  {/* Libellé spécifique */}
                  <td className="px-3 py-2 hidden md:table-cell">
                    <input
                      type="text"
                      value={ligne.libelle}
                      onChange={(e) => updateLigne(index, 'libelle', e.target.value)}
                      className="w-full bg-slate-600 text-white text-xs px-2 py-1.5 rounded-lg"
                      placeholder="Libellé..."
                    />
                  </td>

                  {/* Débit */}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={ligne.debit || ''}
                      onChange={(e) => updateLigne(index, 'debit', e.target.value)}
                      className="w-full bg-slate-600 text-white text-xs px-2 py-1.5 rounded-lg text-right font-mono"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </td>

                  {/* Crédit */}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={ligne.credit || ''}
                      onChange={(e) => updateLigne(index, 'credit', e.target.value)}
                      className="w-full bg-slate-600 text-white text-xs px-2 py-1.5 rounded-lg text-right font-mono"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </td>

                  {/* Action supprimer */}
                  <td className="px-3 py-2 text-center">
                    {lignes.length > 2 && (
                      <button
                        onClick={() => removeLigne(index)}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Footer avec totaux */}
            <tfoot className="bg-slate-700">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-bold text-white text-xs hidden md:table-cell">
                  TOTAUX
                </td>
                <td colSpan={2} className="px-3 py-2 text-right font-bold text-white text-xs md:hidden">
                  TOTAUX
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-sm font-bold text-green-400 font-mono">{totalDebit.toFixed(2)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-sm font-bold text-cyan-400 font-mono">{totalCredit.toFixed(2)}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  {isEquilibre ? (
                    <Check className="w-4 h-4 text-green-400 mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-amber-400 mx-auto" />
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Barre d'état en bas */}
        <div className={`px-3 py-2 flex items-center justify-between border-t ${
          isEquilibre
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2">
            <Calculator className={`w-4 h-4 ${isEquilibre ? 'text-green-400' : 'text-amber-400'}`} />
            <span className={`text-xs font-medium ${isEquilibre ? 'text-green-400' : 'text-amber-400'}`}>
              {isEquilibre ? 'Écriture Équilibrée ✓' : `Écart: ${Math.abs(totalDebit - totalCredit).toFixed(2)} FCFA`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400">Montant total</span>
            <span className="text-sm font-bold text-white ml-2">{totalDebit.toFixed(2)} FCFA</span>
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
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
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