import type { Client } from '@shared/schema';
import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, CheckCircle, X } from 'lucide-react';
import { exportToCSV, exportToJSON } from '../../lib/exportUtils';

interface ClientExportProps {
  clients: Client[];
  onClose: () => void;
}

export default function ClientExport({ clients, onClose }: ClientExportProps) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'nom', 'email', 'telephone', 'status', 'segment', 'score'
  ]);
  const [exporting, setExporting] = useState(false);

  const availableFields = [
    { key: 'nom', label: 'Nom' },
    { key: 'email', label: 'Email' },
    { key: 'telephone', label: 'Téléphone' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'status', label: 'Statut' },
    { key: 'segment', label: 'Segment' },
    { key: 'score', label: 'Score' },
    { key: 'creditTotal', label: 'Crédit Total' },
    { key: 'epargneTotal', label: 'Épargne Total' },
    { key: 'tauxRemboursement', label: 'Taux Remboursement' },
    { key: 'pointsFidelite', label: 'Points Fidélité' },
    { key: 'dateInscription', label: 'Date Inscription' }
  ];

  const toggleField = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter(f => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const doExportCSV = async () => {
    const data = clients.map(client => {
      const filtered: any = {};
      selectedFields.forEach(field => {
        filtered[field] = client[field as keyof Client];
      });
      return filtered;
    });
    await exportToCSV(data, `clients_export_${new Date().toISOString().split('T')[0]}`, {
      saveToLoge: true,
      logeCategorie: 'clients',
      logeTags: ['clients', 'export', 'kyc']
    });
  };

  const doExportJSON = async () => {
    const data = clients.map(client => {
      const filtered: any = {};
      selectedFields.forEach(field => {
        filtered[field] = client[field as keyof Client];
      });
      return filtered;
    });
    await exportToJSON(data, `clients_export_${new Date().toISOString().split('T')[0]}`, {
      saveToLoge: true,
      logeCategorie: 'clients',
      logeTags: ['clients', 'export', 'kyc']
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (format === 'csv') {
        await doExportCSV();
      } else {
        await doExportJSON();
      }
    } finally {
      setExporting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl my-4 max-h-[90vh] overflow-y-auto">
        <div className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Download className="text-cyan-400" size={28} />
              Exporter les Clients
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {clients.length} client{clients.length > 1 ? 's' : ''} sélectionné{clients.length > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-slate-300 mb-3">Format d'export</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setFormat('csv')}
                className={`p-4 rounded-lg border-2 transition ${
                  format === 'csv'
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                }`}
              >
                <FileSpreadsheet size={24} className={`mx-auto mb-2 ${format === 'csv' ? 'text-cyan-400' : 'text-slate-400'}`} />
                <p className={`text-sm font-semibold ${format === 'csv' ? 'text-cyan-400' : 'text-slate-300'}`}>CSV</p>
                <p className="text-xs text-slate-400 mt-1">Excel, Google Sheets</p>
              </button>

              <button
                onClick={() => setFormat('json')}
                className={`p-4 rounded-lg border-2 transition ${
                  format === 'json'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                }`}
              >
                <FileText size={24} className={`mx-auto mb-2 ${format === 'json' ? 'text-emerald-400' : 'text-slate-400'}`} />
                <p className={`text-sm font-semibold ${format === 'json' ? 'text-emerald-400' : 'text-slate-300'}`}>JSON</p>
                <p className="text-xs text-slate-400 mt-1">API, Développeurs</p>
              </button>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-slate-300">Champs à exporter</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedFields(availableFields.map(f => f.key))}
                  className="text-xs px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded transition"
                >
                  Tout sélectionner
                </button>
                <button
                  onClick={() => setSelectedFields([])}
                  className="text-xs px-3 py-1 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition"
                >
                  Tout désélectionner
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {availableFields.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                    className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-300">{field.label}</span>
                </label>
              ))}
            </div>

            <p className="text-xs text-slate-400 mt-3">
              {selectedFields.length} champ{selectedFields.length > 1 ? 's' : ''} sélectionné{selectedFields.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
              <CheckCircle size={18} />
              Aperçu de l'export
            </h3>
            <div className="space-y-1 text-sm text-slate-300">
              <p>Format: <span className="font-semibold text-white">{format.toUpperCase()}</span></p>
              <p>Nombre de clients: <span className="font-semibold text-white">{clients.length}</span></p>
              <p>Champs inclus: <span className="font-semibold text-white">{selectedFields.length}</span></p>
              <p>Nom du fichier: <span className="font-semibold text-white">
                clients_export_{new Date().toISOString().split('T')[0]}.{format}
              </span></p>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={selectedFields.length === 0 || exporting}
            className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
          >
            <Download size={20} />
            {exporting ? 'Export en cours...' : `Exporter en ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
