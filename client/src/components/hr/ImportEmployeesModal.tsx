import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Button, Modal } from '../ui';
import { toast } from '../../lib/toast';

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

interface ImportEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportEmployeesModal({ isOpen, onClose, onSuccess }: ImportEmployeesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; totalRows: number; preview: Record<string, string>[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    // Preview the file
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/hr/import?preview=true', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Erreur lors de la prévisualisation');

      const data = await response.json();
      setPreview(data);
    } catch {
      toast.error('Erreur lors de la lecture du fichier CSV');
      setPreview(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/hr/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Erreur lors de l\'import');

      const data: ImportResult = await response.json();
      setResult(data);

      if (data.created > 0) {
        toast.success(`${data.created} employé(s) importé(s) avec succès`);
        onSuccess();
      }

      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} erreur(s) lors de l'import`);
      }
    } catch {
      toast.error('Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importer des employés (CSV)" size="lg">
      <div className="space-y-4">
        {/* Instructions */}
        <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
          <p className="font-medium text-slate-300 mb-1">Format CSV attendu :</p>
          <p className="font-mono text-[10px]">nom;prenom;email;telephone;sexe;matricule;typeContrat;dateEmbauche;salaireBase</p>
          <p className="mt-1">Séparateur : virgule ou point-virgule. Encodage : UTF-8.</p>
        </div>

        {/* File Input */}
        <div
          className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-cyan-600 transition"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
              <FileText size={18} className="text-cyan-400" />
              <span>{file.name}</span>
              <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload size={24} className="mx-auto text-slate-500" />
              <p className="text-sm text-slate-400">Cliquez pour sélectionner un fichier CSV</p>
            </div>
          )}
        </div>

        {/* Preview Table */}
        {preview && !result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{preview.totalRows} ligne(s) détectée(s)</span>
              <span className="text-slate-500">Aperçu des 10 premières lignes</span>
            </div>
            <div className="overflow-x-auto max-h-48 rounded border border-slate-700">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-800 sticky top-0">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="text-left px-2 py-1 text-slate-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-1 text-slate-300 truncate max-w-[120px]">{row[h] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Result */}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-lg font-bold text-white">{result.total}</div>
                <div className="text-[10px] text-slate-400">Total</div>
              </div>
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                <div className="text-lg font-bold text-emerald-400">{result.created}</div>
                <div className="text-[10px] text-emerald-400/70">Créés</div>
              </div>
              <div className={`rounded-lg p-3 ${result.skipped > 0 ? 'bg-red-900/30 border border-red-800/50' : 'bg-slate-800'}`}>
                <div className={`text-lg font-bold ${result.skipped > 0 ? 'text-red-400' : 'text-slate-500'}`}>{result.skipped}</div>
                <div className="text-[10px] text-slate-400">Ignorés</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-red-900/50 bg-red-950/20 p-2 space-y-1">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                    <span className="text-red-300">
                      Ligne {err.row}{err.field ? ` (${err.field})` : ''}: {err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
          <Button variant="secondary" onClick={handleClose}>
            {result ? 'Fermer' : 'Annuler'}
          </Button>
          {!result && (
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={!file || !preview || importing}
            >
              {importing ? 'Import en cours...' : `Importer ${preview?.totalRows || 0} employé(s)`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
