import type { Client, InsertClient } from '@shared/schema';
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';

interface ClientImportProps {
  onImportComplete: () => void;
  onClose?: () => void;
}

export default function ClientImport({ onImportComplete, onClose }: ClientImportProps) {
  const [showModal, setShowModal] = useState(true);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResults(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        const clients: InsertClient[] = [];
        const errors: string[] = [];
        let successCount = 0;
        let failedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;

          const values = lines[i].split(',').map(v => v.trim());
          const clientData: any = {};

          headers.forEach((header, index) => {
            clientData[header] = values[index];
          });

          if (!clientData.nom || !clientData.email || !clientData.phone) {
            errors.push(`Ligne ${i + 1}: Champs obligatoires manquants (nom, email, phone)`);
            failedCount++;
            continue;
          }

          const client: InsertClient = {
            nom: clientData.nom,
            email: clientData.email,
            telephone: clientData.telephone || clientData.phone,
            adresse: clientData.adresse || '',
            photoUrl: clientData.photo_url || clientData.photoUrl || '',
            status: (clientData.status as any) || 'Actif',
            segment: (clientData.segment as any) || 'Standard',
            score: parseInt(clientData.score) || 50,
            creditTotal: (parseFloat(clientData.credit_total) || 0).toString(),
            epargneTotal: (parseFloat(clientData.epargne_total) || 0).toString(),
            tauxRemboursement: (parseInt(clientData.taux_remboursement) || 0).toString(),
            pointsFidelite: parseInt(clientData.points_fidelite) || 0,
            dateInscription: clientData.date_inscription || new Date().toISOString()
          };

          clients.push(client);
        }

        if (clients.length > 0) {
          for (const client of clients) {
            try {
              const res = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(client),
                credentials: 'include'
              });
              
              if (res.ok) {
                successCount++;
              } else {
                failedCount++;
                try {
                  const errorData = await res.json();
                  errors.push(`Erreur pour ${client.nom}: ${errorData.error || 'Erreur inconnue'}`);
                } catch (e) {
                  errors.push(`Erreur pour ${client.nom}: Erreur inconnue`);
                }
              }
            } catch (error: any) {
              failedCount++;
              errors.push(`Erreur pour ${client.nom}: ${error.error}`);
            }
          }
        }

        setResults({
          success: successCount,
          failed: failedCount,
          errors
        });

        if (successCount > 0) {
          onImportComplete();
        }
      } catch (error: any) {
        setResults({
          success: 0,
          failed: 0,
          errors: [`Erreur de lecture du fichier: ${error.error}`]
        });
      } finally {
        setImporting(false);
      }
    };

    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = `nom,email,phone,adresse,status,segment,score,credit_total,epargne_total,taux_remboursement,points_fidelite
Jean Dupont,jean@example.com,+242 05 123 4567,Brazzaville,Actif,VIP,85,150000,50000,98,2500
Marie Sengele,marie@example.com,+242 05 234 5678,Brazzaville,Actif,Standard,92,200000,75000,100,1800`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_clients.csv';
    a.click();
  };

  const handleCloseModal = () => {
    setShowModal(false);
    if (onClose) {
      onClose();
    }
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl">
        <div className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Upload className="text-cyan-400" size={28} />
              Import CSV de clients
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Importez plusieurs clients en une seule fois via un fichier CSV
            </p>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <XCircle size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
              <AlertCircle size={18} />
              Format du fichier CSV
            </h3>
            <ul className="text-sm text-slate-300 space-y-1 ml-6 list-disc">
              <li>Première ligne: en-têtes des colonnes</li>
              <li>Colonnes obligatoires: nom, email, phone</li>
              <li>Colonnes optionnelles: adresse, status, segment, score, etc.</li>
              <li>Encodage: UTF-8</li>
              <li>Séparateur: virgule (,)</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={downloadTemplate}
              className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Télécharger un modèle
            </button>
          </div>

          <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
            <FileText size={48} className="mx-auto mb-4 text-slate-500" />
            <p className="text-slate-300 mb-4">
              {importing ? 'Import en cours...' : 'Sélectionnez un fichier CSV'}
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={importing}
                className="hidden"
              />
              <span className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-lg inline-flex items-center gap-2 transition disabled:opacity-50">
                <Upload size={20} />
                Choisir un fichier
              </span>
            </label>
          </div>

          {results && (
            <div className="space-y-3">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-white">Résultats de l'import</h3>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 flex items-center gap-3">
                    <CheckCircle className="text-green-400" size={24} />
                    <div>
                      <p className="text-xs text-slate-400">Succès</p>
                      <p className="text-xl font-bold text-green-400">{results.success}</p>
                    </div>
                  </div>

                  <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 flex items-center gap-3">
                    <XCircle className="text-blue-400" size={24} />
                    <div>
                      <p className="text-xs text-slate-400">Échecs</p>
                      <p className="text-xl font-bold text-blue-400">{results.failed}</p>
                    </div>
                  </div>
                </div>

                {results.errors.length > 0 && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <h4 className="font-bold text-blue-400 mb-2 text-sm">Erreurs:</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {results.errors.map((error, idx) => (
                        <p key={idx} className="text-xs text-slate-300">{error}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
