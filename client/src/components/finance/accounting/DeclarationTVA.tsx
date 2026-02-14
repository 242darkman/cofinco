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
  tvaCollectee: number;
  tvaDeductible: number;
  tvaAPayer: number;
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
           <span className="font-bold text-content-primary text-xs">{moisNoms[row.mois - 1]} {row.annee}</span>
           <span className="text-[10px] text-content-muted">Mensuelle</span>
        </div>
      )
    },
    { 
      key: 'tvaCollectee',
      label: 'Collectée', 
      format: (val: number) => <span className="text-xs font-mono text-status-info">{val.toLocaleString()}</span> 
    },
    { 
      key: 'tvaDeductible',
      label: 'Déductible', 
      format: (val: number) => <span className="text-xs font-mono text-status-success">{val.toLocaleString()}</span> 
    },
    { 
      key: 'tvaAPayer', 
      label: 'Net à Payer', 
      format: (val: number) => <span className="text-xs font-bold text-content-primary">{val.toLocaleString()}</span> 
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
            <h2 className="text-sm font-bold text-content-primary">Déclarations TVA</h2>
            <p className="text-[10px] text-content-muted">Direction Générale des Impôts</p>
         </div>
         <Button 
            variant="primary" 
            size="sm" 
            icon={Plus} 
            onClick={() => setShowForm(true)}
            className="h-8 text-xs shadow-lg shadow-status-info/20"
         >
            <span className="hidden sm:inline">Nouvelle Déclaration</span>
            <span className="sm:hidden">Nouvelle</span>
         </Button>
      </div>

      {/* Top Cards - Dashboard Style (Latest Declaration) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Collectée */}
        <Card variant="default" padding="sm" className="bg-status-info/5 ring-1 ring-status-info/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-status-info-bg rounded-lg">
              <TrendingUp className="text-status-info" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-content-primary truncate">TVA Collectée</h3>
              <p className="text-content-muted text-[9px]">{latest ? `${moisNoms[latest.mois - 1]} ${latest.annee}` : 'Aucune donnée'}</p>
            </div>
          </div>
          <p className="text-lg font-bold text-content-primary mb-1">{latest ? formatMoney(latest.tvaCollectee) : '-'}</p>
          <div className="w-full bg-surface rounded-full h-1">
             <div className="h-1 bg-status-info rounded-full w-3/4"></div>
          </div>
        </Card>

        {/* Déductible */}
        <Card variant="default" padding="sm" className="bg-status-success/5 ring-1 ring-status-success/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-status-success-bg rounded-lg">
              <TrendingDown className="text-status-success" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-content-primary truncate">TVA Déductible</h3>
              <p className="text-content-muted text-[9px]">{latest ? `${moisNoms[latest.mois - 1]} ${latest.annee}` : 'Aucune donnée'}</p>
            </div>
          </div>
          <p className="text-lg font-bold text-content-primary mb-1">{latest ? formatMoney(latest.tvaDeductible) : '-'}</p>
          <div className="w-full bg-surface rounded-full h-1">
             <div className="h-1 bg-status-success rounded-full w-1/2"></div>
          </div>
        </Card>

        {/* Net */}
        <Card variant="default" padding="sm" className="bg-status-info/5 ring-1 ring-status-info/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-status-info-bg rounded-lg">
              <Calculator className="text-status-info" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-content-primary truncate">Net à Payer</h3>
              <p className="text-content-muted text-[9px]">À régler avant le 15</p>
            </div>
          </div>
          <p className="text-lg font-bold text-content-primary mb-1">{latest ? formatMoney(latest.tvaAPayer) : '-'}</p>
          <div className="flex items-center gap-1 justify-end">
             <Badge value={latest?.statut || 'N/A'} variant="neutral" size="sm" className="text-[9px] px-1.5 h-4" />
          </div>
        </Card>
      </div>

      {/* Main Table */}
      <Card variant="default" padding="none" className="overflow-hidden min-h-[300px]">
         <div className="p-3 border-b border-edge bg-surface/50 flex justify-between items-center">
            <h3 className="text-xs font-bold text-content-primary flex items-center gap-2">
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
          <Card variant="default" padding="none" className="w-full max-w-lg border-edge shadow-2xl">
             <div className="p-4 border-b border-edge flex justify-between items-center bg-surface/50">
               <h3 className="font-bold text-content-primary">Nouvelle Déclaration</h3>
               <button onClick={() => setShowForm(false)} className="text-content-muted hover:text-content-primary">✕</button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-content-muted">Mois</label>
                      <select 
                         value={form.mois}
                         onChange={(e) => setForm({ ...form, mois: parseInt(e.target.value) })}
                         className="w-full bg-surface-base border border-edge rounded-lg p-2 text-sm text-content-primary focus:ring-1 focus:ring-status-info outline-none"
                      >
                         {moisNoms.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-content-muted">Année</label>
                      <select
                         value={form.annee}
                         onChange={(e) => setForm({ ...form, annee: parseInt(e.target.value) })}
                         className="w-full bg-surface-base border border-edge rounded-lg p-2 text-sm text-content-primary focus:ring-1 focus:ring-status-info outline-none"
                      >
                         {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 5 + i).reverse().map(y => (
                           <option key={y} value={y}>{y}</option>
                         ))}
                      </select>
                   </div>
                </div>

                <div className="space-y-3">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-status-info">TVA Collectée (FCFA)</label>
                      <div className="relative">
                         <TrendingUp size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-status-info" />
                         <input 
                            type="number" 
                            step="0.01"
                            value={form.tva_collectee}
                            onChange={(e) => setForm({ ...form, tva_collectee: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-surface-base border border-edge rounded-lg py-2 pl-9 pr-3 text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info outline-none"
                         />
                      </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-status-success">TVA Déductible (FCFA)</label>
                      <div className="relative">
                         <TrendingDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-status-success" />
                         <input 
                            type="number" 
                            step="0.01"
                            value={form.tva_deductible}
                            onChange={(e) => setForm({ ...form, tva_deductible: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-surface-base border border-edge rounded-lg py-2 pl-9 pr-3 text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-success outline-none"
                         />
                      </div>
                   </div>
                </div>

                <div className="p-3 bg-surface rounded-lg mt-2 flex justify-between items-center border border-edge">
                   <span className="text-xs text-content-muted">Net à Payer</span>
                   <span className="text-lg font-bold text-content-primary">
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
