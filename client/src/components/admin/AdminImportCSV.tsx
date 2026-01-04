import React, { useState, useRef } from 'react';
import { X, Upload, Download, AlertCircle, Check, FileText, AlertTriangle } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';

interface AdminImportCSVProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportRow {
  email: string;
  prenom?: string;
  nom?: string;
  telephone?: string;
  role: string;
  statut: string;
}

export default function AdminImportCSV({ onClose, onSuccess }: AdminImportCSVProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canImportUsers = hasPermission('users', 'import') || hasPermission('users', 'create') || hasPermission('admin', 'manage');

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Format invalide. Seuls les fichiers CSV sont acceptés.');
      return;
    }

    setFile(selectedFile);
    setError('');
    parseCSV(selectedFile);
  };

  const parseCSV = (file: File) => {
    setLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          setError('Fichier vide ou invalide');
          setLoading(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const requiredHeaders = ['email', 'role', 'statut'];

        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
          setError(`Colonnes manquantes: ${missingHeaders.join(', ')}`);
          setLoading(false);
          return;
        }

        const rows: ImportRow[] = [];
        for (let i = 1; i < Math.min(lines.length, 11); i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: any = {};

          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          if (row.email) {
            rows.push(row);
          }
        }

        setPreview(rows);
        setLoading(false);
      } catch (error) {
        setError('Erreur lors de la lecture du fichier');
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        let successCount = 0;
        let failedCount = 0;
        const errors: any[] = [];
        const importedUsers: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          try {
            const values = lines[i].split(',').map(v => v.trim());
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });

            if (!row.email || !row.role || !row.statut) {
              failedCount++;
              errors.push({
                line: i + 1,
                email: row.email || 'N/A',
                error: 'Données incomplètes'
              });
              continue;
            }

            const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 10) + '!';

            const response = await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: row.email,
                password: tempPassword,
                prenom: row.prenom || '',
                nom: row.nom || '',
                telephone: row.telephone || '',
                role: row.role,
                statut: row.statut,
                must_change_password: true
              })
            });

            if (!response.ok) {
              const errorData = await response.json();
              failedCount++;
              errors.push({
                line: i + 1,
                email: row.email,
                error: errorData.error || 'Erreur création'
              });
            } else {
              const userData = await response.json();
              successCount++;
              importedUsers.push(userData.id || '');
            }

            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error: any) {
            failedCount++;
            errors.push({
              line: i + 1,
              email: 'Error',
              error: error.error
            });
          }
        }

        try {
          await fetch('/api/admin-import-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_name: file.name,
              file_size: file.size,
              total_rows: lines.length - 1,
              success_count: successCount,
              failed_count: failedCount,
              errors: errors,
              imported_users: importedUsers,
              status: 'completed',
              completed_at: new Date().toISOString()
            })
          });
        } catch (logError) {
          console.error('Erreur log import:', logError);
        }

        setResult({
          total: lines.length - 1,
          success: successCount,
          failed: failedCount,
          errors: errors.slice(0, 10)
        });

        setImporting(false);
      };

      reader.readAsText(file);

    } catch (error: any) {
      setError(error.error || 'Une erreur est survenue');
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'email,prenom,nom,telephone,role,statut\n' +
      'agent1@cofin.cd,Pierre,Lokombe,+242060000001,Agent Terrain,actif\n' +
      'agent2@cofin.cd,Marie,Nkulu,+242060000002,comptable,actif\n' +
      'manager@cofin.cd,Jean,Kalala,+242060000003,manager,actif';

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_import_utilisateurs.csv';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Upload className="text-blue-400" size={24} />
            <h3 className="text-2xl font-bold text-white">
              Importer Utilisateurs (CSV)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!result && (
            <>
              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-blue-400 flex-shrink-0 mt-1" size={20} />
                  <div className="text-sm text-blue-300 space-y-2">
                    <div className="font-semibold">Format requis :</div>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Fichier CSV avec colonnes : email, prenom, nom, telephone, role, statut</li>
                      <li>Colonnes obligatoires : email, role, statut</li>
                      <li>Rôles valides : Administrateur, Chef d'Agence, Comptable, Agent Caisse, Agent Terrain, Gestionnaire Crédit, Superviseur, Client</li>
                      <li>Statuts valides : actif, inactif, bloqué</li>
                      <li>Mot de passe temporaire généré automatiquement</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={downloadTemplate}
                className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition flex items-center justify-center gap-2"
              >
                <Download size={20} />
                Télécharger modèle CSV
              </button>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-6 py-4 border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-lg transition flex flex-col items-center gap-2 text-slate-400 hover:text-white"
                >
                  <FileText size={32} />
                  <span className="font-semibold">
                    {file ? file.name : 'Cliquer pour sélectionner un fichier CSV'}
                  </span>
                  {file && (
                    <span className="text-sm">
                      {(file.size / 1024).toFixed(2)} KB
                    </span>
                  )}
                </button>
              </div>

              {error && (
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 flex items-center gap-3 text-blue-400">
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </div>
              )}

              {preview.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-white mb-3">
                    Aperçu ({preview.length} premières lignes)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-slate-300">Email</th>
                          <th className="px-4 py-2 text-left text-slate-300">Prénom</th>
                          <th className="px-4 py-2 text-left text-slate-300">Nom</th>
                          <th className="px-4 py-2 text-left text-slate-300">Rôle</th>
                          <th className="px-4 py-2 text-left text-slate-300">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, index) => (
                          <tr key={index} className="border-b border-slate-700">
                            <td className="px-4 py-2 text-white">{row.email}</td>
                            <td className="px-4 py-2 text-slate-300">{row.prenom || '-'}</td>
                            <td className="px-4 py-2 text-slate-300">{row.nom || '-'}</td>
                            <td className="px-4 py-2 text-slate-300">{row.role}</td>
                            <td className="px-4 py-2 text-slate-300">{row.statut}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition"
                >
                  Annuler
                </button>
                {canImportUsers ? (
                  <button
                    onClick={handleImport}
                    disabled={!file || preview.length === 0 || importing}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Upload size={20} />
                    {importing ? 'Import en cours...' : 'Importer'}
                  </button>
                ) : (
                  <div className="flex-1 px-6 py-3 bg-amber-500/20 text-amber-400 rounded-xl font-bold flex items-center justify-center gap-2">
                    <AlertTriangle size={20} />
                    Permission requise
                  </div>
                )}
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className={`rounded-lg p-6 ${
                result.failed === 0 ? 'bg-green-500/20 border border-green-500' : 'bg-cyan-500/20 border border-cyan-500'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  {result.failed === 0 ? (
                    <Check size={24} className="text-green-400" />
                  ) : (
                    <AlertCircle size={24} className="text-cyan-400" />
                  )}
                  <span className={`text-xl font-bold ${result.failed === 0 ? 'text-green-400' : 'text-cyan-400'}`}>
                    Import terminé
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-white">{result.total}</div>
                    <div className="text-sm text-slate-400">Total lignes</div>
                  </div>
                  <div className="bg-green-500/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-400">{result.success}</div>
                    <div className="text-sm text-slate-400">Créés</div>
                  </div>
                  <div className="bg-blue-500/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-400">{result.failed}</div>
                    <div className="text-sm text-slate-400">Échoués</div>
                  </div>
                </div>
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                  <div className="font-semibold text-blue-400 mb-3">
                    Erreurs ({result.errors.length} {result.errors.length > 10 && 'premières'}) :
                  </div>
                  <div className="space-y-2 text-sm">
                    {result.errors.map((err: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 text-blue-300">
                        <span className="font-mono">Ligne {err.line}:</span>
                        <span>{err.email} - {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition"
              >
                Terminé
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
