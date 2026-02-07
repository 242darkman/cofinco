import React, { useState, useRef, useMemo, useCallback } from 'react';
import { X, Upload, Download, AlertCircle, Check, FileText, AlertTriangle, RotateCcw, Loader2, Users, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { ALL_STATUS_LABELS } from '../../lib/status-labels';
import { auditApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

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
  lineNumber?: number;
}

interface DuplicateInfo {
  field: string;
  value: string;
  lines: number[];
}

const PREVIEW_LIMIT = 50;

export default function AdminImportCSV({ onClose, onSuccess }: AdminImportCSVProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canImportUsers = hasPermission('users', 'import') || hasPermission('users', 'create') || hasPermission('admin', 'manage');
  const canRollback = hasPermission('audit', 'rollback') || hasPermission('admin', 'manage');

  // Confirm dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [file, setFile] = useState<File | null>(null);
  const [allRows, setAllRows] = useState<ImportRow[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showAllDuplicates, setShowAllDuplicates] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect duplicates in the CSV
  const duplicates = useMemo((): DuplicateInfo[] => {
    const duplicatesList: DuplicateInfo[] = [];
    const emailMap = new Map<string, number[]>();
    const phoneMap = new Map<string, number[]>();

    allRows.forEach((row, index) => {
      const lineNum = row.lineNumber || index + 2;

      // Check emails
      if (row.email) {
        const email = row.email.toLowerCase().trim();
        if (!emailMap.has(email)) {
          emailMap.set(email, []);
        }
        emailMap.get(email)!.push(lineNum);
      }

      // Check phones
      if (row.telephone) {
        const phone = row.telephone.replace(/\D/g, '');
        if (phone.length >= 8) {
          if (!phoneMap.has(phone)) {
            phoneMap.set(phone, []);
          }
          phoneMap.get(phone)!.push(lineNum);
        }
      }
    });

    // Find actual duplicates (more than one occurrence)
    emailMap.forEach((lines, value) => {
      if (lines.length > 1) {
        duplicatesList.push({ field: 'Email', value, lines });
      }
    });

    phoneMap.forEach((lines, value) => {
      if (lines.length > 1) {
        duplicatesList.push({ field: 'Téléphone', value, lines });
      }
    });

    return duplicatesList;
  }, [allRows]);

  const preview = useMemo(() => allRows.slice(0, PREVIEW_LIMIT), [allRows]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Format invalide. Seuls les fichiers CSV sont acceptés.');
      return;
    }

    setFile(selectedFile);
    setError('');
    setResult(null);
    setBatchId(null);
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
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: any = { lineNumber: i + 1 };

          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          if (row.email) {
            rows.push(row);
          }
        }

        setAllRows(rows);
        setTotalLines(lines.length - 1);
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

    // Warn about duplicates
    if (duplicates.length > 0) {
      openConfirm({
        title: 'Doublons détectés',
        message: `${duplicates.length} doublon(s) détecté(s) dans le fichier. Voulez-vous continuer l'import ? Les doublons peuvent causer des erreurs.`,
        variant: 'warning',
        confirmText: 'Continuer',
        onConfirm: () => performImport(),
      });
      return;
    }

    performImport();
  };

  const performImport = async () => {
    if (!file) return;

    setImporting(true);
    setError('');

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      let successCount = 0;
      let failedCount = 0;
      const errors: any[] = [];
      const importedUsers: string[] = [];

      // Create import batch for tracking
      let currentBatchId: string | null = null;
      try {
        const batchResponse = await fetch('/api/audit/import-batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            importType: 'USERS',
            fileName: file.name,
            totalRecords: lines.length - 1,
          })
        });
        if (batchResponse.ok) {
          const batch = await batchResponse.json();
          currentBatchId = batch.id;
          setBatchId(batch.id);
        }
      } catch (e) {
        console.error('Error creating import batch:', e);
      }

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

          const array = new Uint8Array(8);
          crypto.getRandomValues(array);
          const tempPassword = 'Temp' + Array.from(array, b => b.toString(36)).join('').slice(0, 8) + '!1A';

          const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              email: row.email,
              password: tempPassword,
              prenom: row.prenom || '',
              nom: row.nom || '',
              telephone: row.telephone || '',
              role: row.role,
              statut: row.statut,
              must_change_password: true,
              importBatchId: currentBatchId
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

          await new Promise(resolve => setTimeout(resolve, 50));

        } catch (error: any) {
          failedCount++;
          errors.push({
            line: i + 1,
            email: 'Error',
            error: error.message || 'Erreur inconnue'
          });
        }
      }

      // Update batch with results
      if (currentBatchId) {
        try {
          await fetch(`/api/audit/import-batches/${currentBatchId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              createdRecords: successCount,
              failedRecords: failedCount,
              status: failedCount === 0 ? 'COMPLETED' : 'PARTIAL'
            })
          });
        } catch (e) {
          console.error('Error updating import batch:', e);
        }
      }

      setResult({
        total: lines.length - 1,
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 20),
        batchId: currentBatchId
      });

      setImporting(false);

    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue');
      setImporting(false);
    }
  };

  const handleRollback = useCallback(() => {
    if (!batchId) return;

    openConfirm({
      title: 'Annuler l\'import ?',
      message: `Voulez-vous vraiment annuler cet import ? Tous les utilisateurs créés lors de cet import seront supprimés.`,
      variant: 'danger',
      confirmText: 'Annuler l\'import',
      onConfirm: async () => {
        setRollingBack(true);
        try {
          const response = await auditApi.rollbackImportBatch(batchId);
          if (response.success) {
            toast.success(`Import annulé - ${response.deletedCount} enregistrements supprimés`);
            setResult((prev: any) => ({
              ...prev,
              rolledBack: true,
              rollbackCount: response.deletedCount
            }));
          } else {
            toast.error(response.error || 'Erreur lors de l\'annulation');
          }
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de l\'annulation'));
        } finally {
          setRollingBack(false);
        }
      },
    });
  }, [batchId, openConfirm]);

  const downloadTemplate = () => {
    const template = 'email,prenom,nom,telephone,role,statut\n' +
      'agent1@cofin.cd,Pierre,Lokombe,+242060000001,AGENT_TERRAIN,actif\n' +
      'agent2@cofin.cd,Marie,Nkulu,+242060000002,COMPTABLE,actif\n' +
      'manager@cofin.cd,Jean,Kalala,+242060000003,CHEF_AGENCE,actif';

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_import_utilisateurs.csv';
    a.click();
  };

  const copyBatchId = () => {
    if (batchId) {
      navigator.clipboard.writeText(batchId);
      toast.success('ID du lot copié');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between z-10">
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
                      <li>Rôles valides : ADMIN, CHEF_AGENCE, CAISSIER, AGENT_TERRAIN, COMPTABLE, GESTIONNAIRE_CREDIT, SUPERVISEUR</li>
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
                      {(file.size / 1024).toFixed(2)} KB - {totalLines} lignes de données
                    </span>
                  )}
                </button>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center gap-3 text-red-400">
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </div>
              )}

              {/* Duplicate Warnings */}
              {duplicates.length > 0 && (
                <div className="bg-amber-500/20 border border-amber-500 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                    <div className="flex-1">
                      <div className="font-semibold text-amber-400 mb-2">
                        {duplicates.length} doublon(s) détecté(s) dans le fichier
                      </div>
                      <div className="space-y-1 text-sm text-amber-300">
                        {(showAllDuplicates ? duplicates : duplicates.slice(0, 3)).map((dup, idx) => (
                          <div key={idx}>
                            <strong>{dup.field}:</strong> "{dup.value}" - lignes {dup.lines.join(', ')}
                          </div>
                        ))}
                      </div>
                      {duplicates.length > 3 && (
                        <button
                          onClick={() => setShowAllDuplicates(!showAllDuplicates)}
                          className="mt-2 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          {showAllDuplicates ? (
                            <>
                              <ChevronUp size={14} /> Réduire
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} /> Voir tous ({duplicates.length})
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {preview.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-white">
                      Aperçu ({Math.min(preview.length, PREVIEW_LIMIT)} sur {totalLines} lignes)
                    </div>
                    {totalLines > PREVIEW_LIMIT && (
                      <span className="text-xs text-slate-400">
                        +{totalLines - PREVIEW_LIMIT} lignes non affichées
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">#</th>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">Email</th>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">Prénom</th>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">Nom</th>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">Téléphone</th>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">Rôle</th>
                          <th className="px-3 py-2 text-left text-slate-300 text-xs">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, index) => {
                          const hasDuplicate = duplicates.some(d =>
                            (d.field === 'Email' && d.value === row.email?.toLowerCase().trim()) ||
                            (d.field === 'Téléphone' && d.value === row.telephone?.replace(/\D/g, ''))
                          );

                          return (
                            <tr
                              key={index}
                              className={`border-b border-slate-700 ${hasDuplicate ? 'bg-amber-500/10' : ''}`}
                            >
                              <td className="px-3 py-2 text-slate-500 text-xs">{row.lineNumber || index + 2}</td>
                              <td className="px-3 py-2 text-white text-xs">{row.email}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{row.prenom || '-'}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{row.nom || '-'}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{row.telephone || '-'}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{row.role}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{ALL_STATUS_LABELS[row.statut] || row.statut}</td>
                            </tr>
                          );
                        })}
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
                    {importing ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Import en cours...
                      </>
                    ) : (
                      <>
                        <Upload size={20} />
                        Importer {totalLines} ligne(s)
                      </>
                    )}
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
                result.rolledBack
                  ? 'bg-slate-500/20 border border-slate-500'
                  : result.failed === 0
                  ? 'bg-green-500/20 border border-green-500'
                  : 'bg-cyan-500/20 border border-cyan-500'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  {result.rolledBack ? (
                    <RotateCcw size={24} className="text-slate-400" />
                  ) : result.failed === 0 ? (
                    <Check size={24} className="text-green-400" />
                  ) : (
                    <AlertCircle size={24} className="text-cyan-400" />
                  )}
                  <span className={`text-xl font-bold ${
                    result.rolledBack
                      ? 'text-slate-400'
                      : result.failed === 0
                      ? 'text-green-400'
                      : 'text-cyan-400'
                  }`}>
                    {result.rolledBack ? 'Import annulé' : 'Import terminé'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-white">{result.total}</div>
                    <div className="text-sm text-slate-400">Total lignes</div>
                  </div>
                  <div className={`rounded-lg p-4 ${result.rolledBack ? 'bg-slate-600/50' : 'bg-green-500/20'}`}>
                    <div className={`text-2xl font-bold ${result.rolledBack ? 'text-slate-400 line-through' : 'text-green-400'}`}>
                      {result.success}
                    </div>
                    <div className="text-sm text-slate-400">Créés</div>
                  </div>
                  <div className="bg-red-500/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-400">{result.failed}</div>
                    <div className="text-sm text-slate-400">Échoués</div>
                  </div>
                </div>

                {/* Batch ID for tracking */}
                {batchId && !result.rolledBack && (
                  <div className="mt-4 p-3 bg-slate-700/50 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">ID du lot d'import</div>
                      <div className="text-sm text-white font-mono">{batchId.slice(0, 8)}...</div>
                    </div>
                    <button
                      onClick={copyBatchId}
                      className="p-2 text-slate-400 hover:text-white transition"
                      title="Copier l'ID"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                )}

                {result.rolledBack && (
                  <div className="mt-4 p-3 bg-slate-600/30 rounded-lg text-center">
                    <div className="text-slate-400">
                      {result.rollbackCount} enregistrement(s) supprimé(s)
                    </div>
                  </div>
                )}
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
                  <div className="font-semibold text-red-400 mb-3">
                    Erreurs ({result.errors.length}{result.errors.length >= 20 ? '+' : ''}) :
                  </div>
                  <div className="space-y-2 text-sm max-h-[200px] overflow-y-auto">
                    {result.errors.map((err: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 text-red-300">
                        <span className="font-mono text-xs bg-red-500/30 px-1 rounded">L{err.line}</span>
                        <span className="truncate">{err.email} - {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {/* Rollback Button */}
                {canRollback && batchId && result.success > 0 && !result.rolledBack && (
                  <button
                    onClick={handleRollback}
                    disabled={rollingBack}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {rollingBack ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <RotateCcw size={20} />
                    )}
                    Annuler l'import
                  </button>
                )}

                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition"
                >
                  Terminé
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
