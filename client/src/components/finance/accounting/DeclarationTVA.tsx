import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Save, Download, Calculator, Plus, Filter,
  TrendingUp, TrendingDown, DollarSign, ArrowRight
} from 'lucide-react';
import { Card, Button, Badge, ResponsiveTable } from '../../ui';
import { comptabiliteApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { StatutDeclarationTVA, StatutDeclarationTVAType, STATUT_DECLARATION_TVA_LABELS } from '@shared/enum/status-constants';

interface Declaration {
  id: string;
  mois: number;
  annee: number;
  tva_collectee: number;
  tva_deductible: number;
  tva_a_payer: number;
  statut: StatutDeclarationTVAType;
}

export default function DeclarationTVA() {
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear(),
    tva_collectee: 0,
    tva_deductible: 0,
    numero_quittance: ''
  });

  const moisNoms = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  const fetchDeclarations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await comptabiliteApi.getDeclarationsTVA();
      setDeclarations(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des déclarations'));
      setDeclarations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeclarations();
  }, [fetchDeclarations]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const tvaAPayer = form.tva_collectee - form.tva_deductible;
    const creditTVA = tvaAPayer < 0 ? Math.abs(tvaAPayer) : 0;

    setSubmitting(true);
    try {
      await comptabiliteApi.createDeclarationTVA({
        mois: form.mois,
        annee: form.annee,
        tva_collectee: form.tva_collectee,
        tva_deductible: form.tva_deductible,
        tva_a_payer: tvaAPayer > 0 ? tvaAPayer : 0,
        credit_tva: creditTVA,
        statut: 'DRAFT'
      });

      toast.success('Déclaration créée avec succès');
      setShowForm(false);
      fetchDeclarations();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création de la déclaration'));
    } finally {
      setSubmitting(false);
    }
  }, [form, fetchDeclarations]);

  // Get latest declaration for top stats
  const latest = declarations.length > 0 ? declarations[0] : null;
  const formatMoney = (val: number) => val.toLocaleString() + ' FCFA';

  const columns = [
    { 
      key: 'mois', 
      label: 'Période', 
      primary: true,
      format: (_: any, row: Declaration) => (
        <div className="flex flex-col">
           <span className="font-bold text-white text-xs">{moisNoms[row.mois - 1]} {row.annee}</span>
           <span className="text-[10px] text-slate-400">Mensuelle</span>
        </div>
      )
    },
    { 
      key: 'tva_collectee', 
      label: 'Collectée', 
      format: (val: number) => <span className="text-xs font-mono text-blue-400">{val.toLocaleString()}</span> 
    },
    { 
      key: 'tva_deductible', 
      label: 'Déductible', 
      format: (val: number) => <span className="text-xs font-mono text-emerald-400">{val.toLocaleString()}</span> 
    },
    { 
      key: 'tva_a_payer', 
      label: 'Net à Payer', 
      format: (val: number) => <span className="text-xs font-bold text-white">{val.toLocaleString()}</span> 
    },
    { 
      key: 'statut', 
      label: 'Statut', 
      format: (val: string) => (
        <Badge 
           value={val} 
           variant={val === StatutDeclarationTVA.PAID ? 'success' : val === StatutDeclarationTVA.DRAFT ? 'neutral' : 'warning'} 
           size="sm" 
        />
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Header Compact */}
      <div className="flex justify-between items-center">
         <div>
            <h2 className="text-sm font-bold text-white">Déclarations TVA</h2>
            <p className="text-[10px] text-slate-400">Direction Générale des Impôts</p>
         </div>
         <Button 
            variant="primary" 
            size="sm" 
            icon={Plus} 
            onClick={() => setShowForm(true)}
            className="h-8 text-xs shadow-lg shadow-blue-500/20"
         >
            <span className="hidden sm:inline">Nouvelle Déclaration</span>
            <span className="sm:hidden">Nouvelle</span>
         </Button>
      </div>

      {/* Top Cards - Dashboard Style (Latest Declaration) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Collectée */}
        <Card variant="default" padding="sm" className="bg-blue-500/5 ring-1 ring-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-500/20 rounded-lg">
              <TrendingUp className="text-blue-400" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-white truncate">TVA Collectée</h3>
              <p className="text-slate-500 text-[9px]">{latest ? `${moisNoms[latest.mois - 1]} ${latest.annee}` : 'Aucune donnée'}</p>
            </div>
          </div>
          <p className="text-lg font-bold text-white mb-1">{latest ? formatMoney(latest.tva_collectee) : '-'}</p>
          <div className="w-full bg-slate-800 rounded-full h-1">
             <div className="h-1 bg-blue-500 rounded-full w-3/4"></div>
          </div>
        </Card>

        {/* Déductible */}
        <Card variant="default" padding="sm" className="bg-emerald-500/5 ring-1 ring-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-emerald-500/20 rounded-lg">
              <TrendingDown className="text-emerald-400" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-white truncate">TVA Déductible</h3>
              <p className="text-slate-500 text-[9px]">{latest ? `${moisNoms[latest.mois - 1]} ${latest.annee}` : 'Aucune donnée'}</p>
            </div>
          </div>
          <p className="text-lg font-bold text-white mb-1">{latest ? formatMoney(latest.tva_deductible) : '-'}</p>
          <div className="w-full bg-slate-800 rounded-full h-1">
             <div className="h-1 bg-emerald-500 rounded-full w-1/2"></div>
          </div>
        </Card>

        {/* Net */}
        <Card variant="default" padding="sm" className="bg-purple-500/5 ring-1 ring-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-500/20 rounded-lg">
              <Calculator className="text-purple-400" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-white truncate">Net à Payer</h3>
              <p className="text-slate-500 text-[9px]">À régler avant le 15</p>
            </div>
          </div>
          <p className="text-lg font-bold text-white mb-1">{latest ? formatMoney(latest.tva_a_payer) : '-'}</p>
          <div className="flex items-center gap-1 justify-end">
             <Badge value={latest?.statut || 'N/A'} variant="neutral" size="sm" className="text-[9px] px-1.5 h-4" />
          </div>
        </Card>
      </div>

      {/* Main Table */}
      <Card variant="default" padding="none" className="overflow-hidden min-h-[300px]">
         <div className="p-3 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
               Historique
            </h3>
            <Button variant="ghost" size="sm" icon={Filter} className="h-6 text-[10px]" />
         </div>
         <ResponsiveTable
            data={declarations}
            columns={columns}
            loading={loading}
            emptyMessage="Aucune déclaration enregistrée"
         />
      </Card>

      {/* Form Modal - Updated Style */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card variant="default" padding="none" className="w-full max-w-lg border-slate-700 shadow-2xl">
             <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
               <h3 className="font-bold text-white">Nouvelle Déclaration</h3>
               <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Mois</label>
                      <select 
                         value={form.mois}
                         onChange={(e) => setForm({ ...form, mois: parseInt(e.target.value) })}
                         className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                         {moisNoms.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Année</label>
                      <select
                         value={form.annee}
                         onChange={(e) => setForm({ ...form, annee: parseInt(e.target.value) })}
                         className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                      >
                         {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 5 + i).reverse().map(y => (
                           <option key={y} value={y}>{y}</option>
                         ))}
                      </select>
                   </div>
                </div>

                <div className="space-y-3">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-blue-400">TVA Collectée (FCFA)</label>
                      <div className="relative">
                         <TrendingUp size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                         <input 
                            type="number" 
                            step="0.01"
                            value={form.tva_collectee}
                            onChange={(e) => setForm({ ...form, tva_collectee: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                         />
                      </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-emerald-400">TVA Déductible (FCFA)</label>
                      <div className="relative">
                         <TrendingDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                         <input 
                            type="number" 
                            step="0.01"
                            value={form.tva_deductible}
                            onChange={(e) => setForm({ ...form, tva_deductible: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-white font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                         />
                      </div>
                   </div>
                </div>

                <div className="p-3 bg-slate-800 rounded-lg mt-2 flex justify-between items-center border border-slate-700">
                   <span className="text-xs text-slate-400">Net à Payer</span>
                   <span className="text-lg font-bold text-white">
                      {(form.tva_collectee - form.tva_deductible).toLocaleString()} FCFA
                   </span>
                </div>

                <div className="flex gap-2 pt-2">
                   <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">Annuler</Button>
                   <Button variant="primary" type="submit" className="flex-1" icon={Save}>Enregistrer</Button>
                </div>
             </form>
          </Card>
        </div>
      )}
    </div>
  );
}
