import React, { useState, useCallback } from 'react';
import {
  Download,
  FileText,
  AlertTriangle,
  CheckCircle,
  Building2,
} from 'lucide-react';
import { Modal, Button, Card, Badge, TabGroup } from '../ui';
import { usePayrollTransfers } from '../../hooks/hr/usePayrollTransfers';

interface Props {
  runId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

const fmt = (amount: number) =>
  new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function TransferFileModal({ runId, isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState('apercu');
  const [successMsg, setSuccessMsg] = useState('');

  const {
    preview,
    files,
    loadingPreview,
    generateTransferFile,
    isGenerating,
    downloadCsv,
    downloadBordereau,
  } = usePayrollTransfers(runId);

  const validCount = preview?.valid.length ?? 0;
  const invalidCount = preview?.invalid.length ?? 0;

  const handleGenerate = useCallback(async () => {
    setSuccessMsg('');
    try {
      const result = await generateTransferFile();
      const baseName = `virement_${runId}`;
      downloadCsv(result.csvContent, `${baseName}.csv`);
      downloadBordereau(result.bordereauContent, `${baseName}_bordereau.txt`);
      setSuccessMsg('Fichier de virement et bordereau generés avec succès.');
    } catch {
      // errors handled by hook toast
    }
  }, [generateTransferFile, downloadCsv, downloadBordereau, runId]);

  const tabs = [
    { key: 'apercu', label: 'Aperçu', icon: FileText },
    { key: 'historique', label: 'Historique', icon: Download, badge: files.length || undefined },
  ];

  const footer = (
    <div className="flex items-center gap-3 w-full justify-between">
      <div className="text-xs text-content-muted">
        {validCount > 0 && `${validCount} employé(s) éligible(s)`}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
        <Button
          variant="primary"
          icon={Download}
          onClick={handleGenerate}
          disabled={validCount === 0 || isGenerating}
          isLoading={isGenerating}
        >
          Générer fichier virement
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fichier de virement bancaire"
      subtitle={`Run #${runId}`}
      size="xl"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Success message */}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-status-success-bg border border-status-success/30 text-status-success text-sm">
            <CheckCircle size={16} className="shrink-0" />
            {successMsg}
          </div>
        )}

        <TabGroup
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="pills"
          size="sm"
        />

        {/* ---- APERCU TAB ---- */}
        {activeTab === 'apercu' && (
          <div className="space-y-4">
            {loadingPreview ? (
              <div className="flex items-center justify-center py-12 text-content-muted text-sm">
                Chargement de l'aperçu...
              </div>
            ) : !preview ? (
              <div className="flex items-center justify-center py-12 text-content-muted text-sm">
                Aucune donnée disponible.
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card padding="sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-status-success-bg">
                        <CheckCircle size={18} className="text-status-success" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-content-primary">{validCount}</p>
                        <p className="text-xs text-content-muted">Employés éligibles</p>
                      </div>
                    </div>
                  </Card>
                  <Card padding="sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-accent/10">
                        <Building2 size={18} className="text-accent" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-content-primary">
                          {fmt(preview.totalAmount)}
                        </p>
                        <p className="text-xs text-content-muted">Montant total</p>
                      </div>
                    </div>
                  </Card>
                  <Card padding="sm">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${invalidCount > 0 ? 'bg-status-danger-bg' : 'bg-surface-subtle'}`}>
                        <AlertTriangle
                          size={18}
                          className={invalidCount > 0 ? 'text-status-danger' : 'text-content-muted'}
                        />
                      </div>
                      <div>
                        <p className={`text-xl font-bold ${invalidCount > 0 ? 'text-status-danger' : 'text-content-primary'}`}>
                          {invalidCount}
                        </p>
                        <p className="text-xs text-content-muted">Employés invalides</p>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Valid transfers table */}
                {validCount > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-edge">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-elevated">
                        <tr>
                          <th className="text-left px-3 py-2 text-content-muted font-medium">Employé</th>
                          <th className="text-left px-3 py-2 text-content-muted font-medium">Banque</th>
                          <th className="text-left px-3 py-2 text-content-muted font-medium">Compte</th>
                          <th className="text-right px-3 py-2 text-content-muted font-medium">Montant net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.valid.map((t) => (
                          <tr key={t.employeId} className="border-t border-edge hover:bg-surface-subtle/40 transition-colors">
                            <td className="px-3 py-2 text-content-primary font-medium">{t.employeNom}</td>
                            <td className="px-3 py-2 text-content-secondary">{t.bankName}</td>
                            <td className="px-3 py-2 text-content-secondary font-mono text-[11px]">
                              {t.accountNumber}
                            </td>
                            <td className="px-3 py-2 text-right text-content-primary font-semibold">
                              {fmt(t.montantNet)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Invalid employees warning */}
                {invalidCount > 0 && (
                  <div className="rounded-lg border border-status-warning/30 bg-status-warning-bg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-status-warning">
                      <AlertTriangle size={16} />
                      {invalidCount} employé(s) avec des erreurs
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {preview.invalid.map((inv) => (
                        <div
                          key={inv.employeId}
                          className="flex items-start gap-2 text-xs text-content-secondary"
                        >
                          <span className="font-medium shrink-0">{inv.employeNom}</span>
                          <span className="text-content-muted">-</span>
                          <div className="flex flex-wrap gap-1">
                            {inv.errors.map((err, i) => (
                              <Badge key={i} variant="danger" size="xs" value={err} rawValue />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- HISTORIQUE TAB ---- */}
        {activeTab === 'historique' && (
          <div className="space-y-3">
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-content-muted gap-2">
                <FileText size={32} />
                <p className="text-sm">Aucun fichier généré pour cette paie.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-edge">
                <table className="w-full text-xs">
                  <thead className="bg-surface-elevated">
                    <tr>
                      <th className="text-left px-3 py-2 text-content-muted font-medium">Nom fichier</th>
                      <th className="text-left px-3 py-2 text-content-muted font-medium">Date</th>
                      <th className="text-right px-3 py-2 text-content-muted font-medium">Nb employés</th>
                      <th className="text-right px-3 py-2 text-content-muted font-medium">Montant total</th>
                      <th className="text-center px-3 py-2 text-content-muted font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <tr key={f.id} className="border-t border-edge hover:bg-surface-subtle/40 transition-colors">
                        <td className="px-3 py-2 text-content-primary font-medium flex items-center gap-1.5">
                          <FileText size={14} className="text-accent shrink-0" />
                          {f.fileName}
                        </td>
                        <td className="px-3 py-2 text-content-secondary">{fmtDate(f.createdAt)}</td>
                        <td className="px-3 py-2 text-right text-content-primary">{f.employeeCount}</td>
                        <td className="px-3 py-2 text-right text-content-primary font-semibold">
                          {fmt(Number(f.totalAmount))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Download}
                            onClick={() =>
                              window.open(`/api/hr/paie/transfer-files/${f.id}/download`, '_blank')
                            }
                          >
                            Télécharger
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
