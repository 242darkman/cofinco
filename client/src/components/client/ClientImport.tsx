import type { InsertClient } from '@shared/schema';
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Download, Loader2, ArrowRight } from 'lucide-react';
import Papa from 'papaparse';

interface ClientImportProps {
  onImportComplete: () => void;
  onClose?: () => void;
}

type ImportPhase = 'IDLE' | 'PARSING' | 'PREVIEW' | 'UPLOADING' | 'COMPLETE';

interface ParsedResult {
  valid: InsertClient[];
  invalid: { row: number; data: any; errors: string[] }[];
  total: number;
}

export default function ClientImport({ onImportComplete, onClose }: ClientImportProps) {
  const [showModal, setShowModal] = useState(true);
  const [phase, setPhase] = useState<ImportPhase>('IDLE');
  const [parsedData, setParsedData] = useState<ParsedResult | null>(null);
  const [uploadResult, setUploadResult] = useState<{ successCount: number; errors: string[] } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhase('PARSING');
    setParsedData(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: InsertClient[] = [];
        const invalid: { row: number; data: any; errors: string[] }[] = [];

        results.data.forEach((row: any, index) => {
          const rowErrors: string[] = [];
          
          // Basic Validation
          if (!row.nom) rowErrors.push("Nom manquant");
          if (!row.email) rowErrors.push("Email manquant");
          if (!row.phone && !row.telephone) rowErrors.push("Téléphone manquant");

          if (rowErrors.length > 0) {
            invalid.push({ row: index + 2, data: row, errors: rowErrors });
          } else {
            // Transform & Normalize
            valid.push({
              nom: row.nom,
              email: row.email,
              telephone: row.telephone || row.phone, // Support both header names
              adresse: row.adresse || '',
              photoUrl: row.photo_url || row.photoUrl || '',
              statut: row.status || row.statut || 'ACTIVE',
              segment: row.segment || 'Standard',
              score: parseInt(row.score) || 50,
              creditTotal: (parseFloat(row.credit_total) || 0).toString(),
              epargneTotal: (parseFloat(row.epargne_total) || 0).toString(),
              tauxRemboursement: (parseInt(row.taux_remboursement) || 0).toString(),
              pointsFidelite: parseInt(row.points_fidelite) || 0,
              dateInscription: row.date_inscription || new Date().toISOString()
            } as InsertClient);
          }
        });

        setParsedData({
          valid,
          invalid,
          total: results.data.length
        });
        setPhase('PREVIEW');
      },
      error: (error) => {
        setUploadResult({ successCount: 0, errors: [`Erreur de parsing CSV : ${error.message}`] });
        setPhase('COMPLETE');
      }
    });
  };

  const handleConfirmImport = async () => {
    if (!parsedData || parsedData.valid.length === 0) return;

    setPhase('UPLOADING');
    try {
      const res = await fetch('/api/clients/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData.valid),
      });

      const data = await res.json();
      
      if (res.ok) {
        setUploadResult({
          successCount: data.count,
          errors: []
        });
        onImportComplete();
      } else {
        setUploadResult({
          successCount: 0,
          errors: [data.message || "Erreur lors de l'import"]
        });
      }
    } catch (error) {
       setUploadResult({
          successCount: 0,
          errors: ["Erreur réseau lors de l'envoi"]
       });
    } finally {
      setPhase('COMPLETE');
    }
  };

  const downloadTemplate = () => {
    const template = `nom,email,phone,adresse,statut,segment,score,credit_total,epargne_total,taux_remboursement,points_fidelite
Jean Dupont,jean@example.com,+242 06 123 4567,Brazzaville,ACTIVE,VIP,85,150000,50000,98,2500
Marie Sengele,marie@example.com,+242 06 234 5678,Brazzaville,ACTIVE,Standard,92,200000,75000,100,1800`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_clients.csv';
    a.click();
  };

  const handleCloseModal = () => {
    setShowModal(false);
    if (onClose) onClose();
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Upload className="text-cyan-400" size={28} />
              Import CSV de clients
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Importez plusieurs clients en masse via CSV
            </p>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <XCircle size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          
          {/* Phase 1: IDLE - Upload & Instructions */}
          {phase === 'IDLE' && (
            <div className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
                  <AlertCircle size={18} />
                  Format du fichier CSV
                </h3>
                <ul className="text-sm text-slate-300 space-y-1 ml-6 list-disc">
                  <li>Colonnes obligatoires: <strong>nom, email, phone</strong></li>
                  <li>Séparateur: virgule (,)</li>
                  <li>Encodage: UTF-8</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  Télécharger le modèle
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-cyan-500 transition-colors">
                <FileText size={48} className="mx-auto mb-4 text-slate-500" />
                <p className="text-slate-300 mb-4">
                  Sélectionnez un fichier CSV à analyser
                </p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-lg inline-flex items-center gap-2 transition shadow-lg shadow-cyan-500/20">
                    <Upload size={20} />
                    Choisir un fichier
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Phase 2: PARSING / UPLOADING */}
          {(phase === 'PARSING' || phase === 'UPLOADING') && (
             <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-12 w-12 text-cyan-400 animate-spin" />
                <p className="text-slate-300 text-lg">
                  {phase === 'PARSING' ? 'Analyse du fichier...' : 'Importation des données en cours...'}
                </p>
             </div>
          )}

          {/* Phase 3: PREVIEW */}
          {phase === 'PREVIEW' && parsedData && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-center">
                    <div className="text-3xl font-bold text-green-400 mb-1">{parsedData.valid.length}</div>
                    <div className="text-sm text-green-300 font-medium">Clients Valides</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-center">
                    <div className="text-3xl font-bold text-red-400 mb-1">{parsedData.invalid.length}</div>
                    <div className="text-sm text-red-300 font-medium">Clients Invalides</div>
                  </div>
               </div>

               {parsedData.invalid.length > 0 && (
                 <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 font-semibold text-slate-300 flex items-center gap-2">
                       <AlertCircle size={16} className="text-red-400"/>
                       Erreurs détectées ({parsedData.invalid.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto p-4 space-y-3">
                       {parsedData.invalid.map((record, idx) => (
                          <div key={idx} className="text-sm text-red-300 border-b border-white/5 pb-2 last:border-0">
                             <span className="font-bold text-red-200">Ligne {record.row}: </span>
                             {record.errors.join(', ')}
                          </div>
                       ))}
                    </div>
                    <div className="bg-slate-900/50 px-4 py-2 text-xs text-slate-500 text-center">
                      Les lignes invalides seront ignorées lors de l'import.
                    </div>
                 </div>
               )}

               <div className="flex gap-3 pt-4">
                 <button 
                    onClick={() => setPhase('IDLE')}
                    className="px-6 py-3 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
                 >
                    Annuler
                 </button>
                 <button
                    onClick={handleConfirmImport}
                    disabled={parsedData.valid.length === 0}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold rounded-lg shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                 >
                    Importer {parsedData.valid.length} clients
                    <ArrowRight size={20} />
                 </button>
               </div>
            </div>
          )}

          {/* Phase 4: COMPLETE */}
          {phase === 'COMPLETE' && uploadResult && (
            <div className="text-center py-8 space-y-6">
              {uploadResult.successCount > 0 ? (
                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 text-green-400 mb-4">
                  <CheckCircle size={40} />
                </div>
              ) : (
                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-red-500/20 text-red-400 mb-4">
                  <XCircle size={40} />
                </div>
              )}
              
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {uploadResult.successCount > 0 ? 'Import terminé !' : 'Échec de l\'import'}
                </h3>
                <p className="text-slate-400">
                  {uploadResult.successCount} client(s) ont été importés avec succès.
                </p>
              </div>

              {uploadResult.errors.length > 0 && (
                 <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-left max-w-lg mx-auto">
                    <h4 className="font-bold text-red-400 mb-2">Erreurs :</h4>
                    <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
                      {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                 </div>
              )}

              <button
                onClick={handleCloseModal}
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
              >
                Fermer
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
