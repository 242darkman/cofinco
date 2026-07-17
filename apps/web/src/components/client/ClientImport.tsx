import type { InsertClient } from '@shared/schema';
import { Spinner } from '@/components/ui/Spinner';
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Download, ArrowRight } from 'lucide-react';
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
              dateAdhesion: row.date_adhesion || new Date().toISOString()
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
      <div className="bg-gradient-to-br from-surface-base to-surface border border-edge rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-surface-base/95 backdrop-blur-sm border-b border-edge p-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-content-primary flex items-center gap-3">
              <Upload className="text-accent" size={28} />
              Import CSV de clients
            </h2>
            <p className="text-content-muted text-sm mt-2">
              Importez plusieurs clients en masse via CSV
            </p>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-2 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-content-primary"
          >
            <XCircle size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          
          {/* Phase 1: IDLE - Upload & Instructions */}
          {phase === 'IDLE' && (
            <div className="space-y-6">
              <div className="bg-status-info-bg border border-status-info/30 rounded-lg p-4">
                <h3 className="font-bold text-status-info mb-2 flex items-center gap-2">
                  <AlertCircle size={18} />
                  Format du fichier CSV
                </h3>
                <ul className="text-sm text-content-secondary space-y-1 ml-6 list-disc">
                  <li>Colonnes obligatoires: <strong>nom, email, phone</strong></li>
                  <li>Séparateur: virgule (,)</li>
                  <li>Encodage: UTF-8</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex-1 px-4 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary font-semibold rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  Télécharger le modèle
                </button>
              </div>

              <div className="border-2 border-dashed border-edge-strong rounded-lg p-8 text-center hover:border-accent transition-colors">
                <FileText size={48} className="mx-auto mb-4 text-content-muted" />
                <p className="text-content-secondary mb-4">
                  Sélectionnez un fichier CSV à analyser
                </p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="px-6 py-3 bg-linear-to-r from-accent to-status-info hover:from-accent hover:to-status-info text-white font-semibold rounded-lg inline-flex items-center gap-2 transition shadow-lg shadow-accent/20">
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
                <Spinner size="xl" tone="accent" />
                <p className="text-content-secondary text-lg">
                  {phase === 'PARSING' ? 'Analyse du fichier...' : 'Importation des données en cours...'}
                </p>
             </div>
          )}

          {/* Phase 3: PREVIEW */}
          {phase === 'PREVIEW' && parsedData && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-status-success-bg border border-status-success/20 p-4 rounded-xl text-center">
                    <div className="text-3xl font-bold text-status-success mb-1">{parsedData.valid.length}</div>
                    <div className="text-sm text-status-success font-medium">Clients Valides</div>
                  </div>
                  <div className="bg-status-danger-bg border border-status-danger/20 p-4 rounded-xl text-center">
                    <div className="text-3xl font-bold text-status-danger mb-1">{parsedData.invalid.length}</div>
                    <div className="text-sm text-status-danger font-medium">Clients Invalides</div>
                  </div>
               </div>

               {parsedData.invalid.length > 0 && (
                 <div className="bg-surface-base rounded-lg border border-edge overflow-hidden">
                    <div className="bg-surface-base px-4 py-2 border-b border-edge font-semibold text-content-secondary flex items-center gap-2">
                       <AlertCircle size={16} className="text-status-danger"/>
                       Erreurs détectées ({parsedData.invalid.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto p-4 space-y-3">
                       {parsedData.invalid.map((record, idx) => (
                          <div key={idx} className="text-sm text-status-danger border-b border-white/5 pb-2 last:border-0">
                             <span className="font-bold text-status-danger-text">Ligne {record.row}: </span>
                             {record.errors.join(', ')}
                          </div>
                       ))}
                    </div>
                    <div className="bg-surface-base/50 px-4 py-2 text-xs text-content-muted text-center">
                      Les lignes invalides seront ignorées lors de l'import.
                    </div>
                 </div>
               )}

               <div className="flex gap-3 pt-4">
                 <button 
                    onClick={() => setPhase('IDLE')}
                    className="px-6 py-3 rounded-lg border border-edge-strong text-content-secondary hover:bg-surface transition"
                 >
                    Annuler
                 </button>
                 <button
                    onClick={handleConfirmImport}
                    disabled={parsedData.valid.length === 0}
                    className="flex-1 px-6 py-3 bg-linear-to-r from-status-success to-status-success hover:from-status-success hover:to-status-success text-white font-bold rounded-lg shadow-lg shadow-status-success/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
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
                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-status-success-bg text-status-success mb-4">
                  <CheckCircle size={40} />
                </div>
              ) : (
                <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-status-danger-bg text-status-danger mb-4">
                  <XCircle size={40} />
                </div>
              )}
              
              <div>
                <h3 className="text-2xl font-bold text-content-primary mb-2">
                  {uploadResult.successCount > 0 ? 'Import terminé !' : 'Échec de l\'import'}
                </h3>
                <p className="text-content-muted">
                  {uploadResult.successCount} client(s) ont été importés
                </p>
              </div>

              {uploadResult.errors.length > 0 && (
                 <div className="bg-status-danger-bg border border-status-danger/20 rounded-lg p-4 text-left max-w-lg mx-auto">
                    <h4 className="font-bold text-status-danger mb-2">Erreurs :</h4>
                    <ul className="list-disc list-inside text-sm text-status-danger space-y-1">
                      {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                 </div>
              )}

              <button
                onClick={handleCloseModal}
                className="px-8 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary font-semibold rounded-lg transition"
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
