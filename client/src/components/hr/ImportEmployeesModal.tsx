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
        <div className="bg-surface/50 rounded-lg p-3 text-xs text-content-muted">
          <p className="font-medium text-content-secondary mb-1">Format CSV attendu :</p>
          <p className="font-mono text-[10px]">nom;prenom;email;telephone;sexe;matricule;typeContrat;dateEmbauche;salaireBase</p>
          <p className="mt-1">Séparateur : virgule ou point-virgule. Encodage : UTF-8.</p>
        </div>

        {/* File Input */}
        <div
          className="border-2 border-dashed border-edge rounded-lg p-6 text-center cursor-pointer hover:border-accent transition"
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
            <div className="flex items-center justify-center gap-2 text-sm text-content-secondary">
              <FileText size={18} className="text-accent" />
              <span>{file.name}</span>
              <span className="text-content-muted">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload size={24} className="mx-auto text-content-muted" />
              <p className="text-sm text-content-muted">Cliquez pour sélectionner un fichier CSV</p>
            </div>
          )}
        </div>

        {/* Preview Table */}
        {preview && !result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-content-muted">{preview.totalRows} ligne(s) détectée(s)</span>
              <span className="text-content-muted">Aperçu des 10 premières lignes</span>
            </div>
            <div className="overflow-x-auto max-h-48 rounded border border-edge">
              <table className="w-full text-[10px]">
                <thead className="bg-surface sticky top-0">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="text-left px-2 py-1 text-content-muted font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-edge">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-1 text-content-secondary truncate max-w-[120px]">{row[h] || '-'}</td>
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
              <div className="bg-surface rounded-lg p-3">
                <div className="text-lg font-bold text-content-primary">{result.total}</div>
                <div className="text-[10px] text-content-muted">Total</div>
              </div>
              <div className="bg-status-success-bg border border-status-success/30/50 rounded-lg p-3">
                <div className="text-lg font-bold text-status-success">{result.created}</div>
                <div className="text-[10px] text-status-success/70">Créés</div>
              </div>
              <div className={`rounded-lg p-3 ${result.skipped > 0 ? 'bg-status-danger-bg border border-status-danger/30/50' : 'bg-surface'}`}>
                <div className={`text-lg font-bold ${result.skipped > 0 ? 'text-status-danger' : 'text-content-muted'}`}>{result.skipped}</div>
                <div className="text-[10px] text-content-muted">Ignorés</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-status-danger/30 bg-status-danger-bg p-2 space-y-1">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <AlertCircle size={12} className="text-status-danger shrink-0 mt-0.5" />
                    <span className="text-status-danger">
                      Ligne {err.row}{err.field ? ` (${err.field})` : ''}: {err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-edge">
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
