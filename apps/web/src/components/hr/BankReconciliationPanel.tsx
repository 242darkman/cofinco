import React, { useState, useRef } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Plus, Upload, Zap, CheckCircle, AlertTriangle, Eye, ArrowLeft, Lock, FileText, Loader2 } from 'lucide-react';
import { Card, Button, Modal, Badge, FormField, SelectField } from '../ui';
import { useBankReconciliation, useReconciliationDetail, type ReconciliationSession } from '../../hooks/hr/useBankReconciliation';
import { usePermissions } from '../auth/ProtectedFeature';

const STATUS_CONFIG: Record<string, { variant: 'warning' | 'info' | 'success'; label: string }> = {
  DRAFT: { variant: 'warning', label: 'Brouillon' },
  IN_PROGRESS: { variant: 'info', label: 'En cours' },
  COMPLETED: { variant: 'success', label: 'Terminé' },
};

const MATCH_CONFIG: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  MATCHED: { variant: 'success', label: 'Rapproché' },
  UNMATCHED: { variant: 'warning', label: 'Non rapproché' },
  IGNORED: { variant: 'info', label: 'Ignoré' },
  DISCREPANCY: { variant: 'danger', label: 'Écart' },
};

const fmt = (amount: number | string) =>
  new Intl.NumberFormat('fr-FR').format(typeof amount === 'string' ? parseInt(amount) : amount) + ' FCFA';

export default function BankReconciliationPanel() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'manage') || hasPermission('paie', 'manage');

  const { sessions, isLoading, createSession, isCreating, completeSession } = useBankReconciliation();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPeriod, setNewPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [newBankName, setNewBankName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    session: sessionDetail,
    isLoading: loadingDetail,
    importStatement,
    isImporting,
    autoMatch,
    isAutoMatching,
    updateLine,
  } = useReconciliationDetail(selectedSessionId);

  const handleCreate = async () => {
    if (!newPeriod || !newBankName) return;
    const result = await createSession({ period: newPeriod, bankName: newBankName });
    setShowCreateModal(false);
    setNewBankName('');
    if (result) setSelectedSessionId(result.id);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importStatement(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleIgnore = async (lineId: string) => {
    await updateLine({ lineId, matchStatus: 'IGNORED' });
  };

  const handleUnmatch = async (lineId: string) => {
    await updateLine({ lineId, matchStatus: 'UNMATCHED' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  // Detail view
  if (selectedSessionId && sessionDetail) {
    const transferLines = sessionDetail.lines?.filter(l => l.source === 'TRANSFER') || [];
    const bankLines = sessionDetail.lines?.filter(l => l.source === 'BANK') || [];
    const matched = sessionDetail.lines?.filter(l => l.matchStatus === 'MATCHED') || [];
    const unmatched = sessionDetail.lines?.filter(l => l.matchStatus === 'UNMATCHED') || [];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSessionId(null)}>
            <ArrowLeft size={14} className="mr-1" /> Retour
          </Button>
          <h3 className="text-sm font-bold text-content-primary">
            {sessionDetail.bankName} — {sessionDetail.period}
          </h3>
          <Badge variant={STATUS_CONFIG[sessionDetail.statut]?.variant || 'info'}>
            {STATUS_CONFIG[sessionDetail.statut]?.label || sessionDetail.statut}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-content-primary">{fmt(sessionDetail.totalExpected)}</div>
            <div className="text-xs text-content-muted">Attendu</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-status-success">{fmt(sessionDetail.totalMatched)}</div>
            <div className="text-xs text-content-muted">Rapproché</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-status-warning">{matched.length}/{transferLines.length}</div>
            <div className="text-xs text-content-muted">Lignes matchées</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-status-danger">{unmatched.length}</div>
            <div className="text-xs text-content-muted">Non rapprochées</div>
          </Card>
        </div>

        {/* Actions */}
        {canManage && sessionDetail.statut !== 'COMPLETED' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              {isImporting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Upload size={14} className="mr-1" />}
              Importer relevé
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />

            {bankLines.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => autoMatch()} disabled={isAutoMatching}>
                {isAutoMatching ? <Loader2 size={14} className="animate-spin mr-1" /> : <Zap size={14} className="mr-1" />}
                Rapprochement auto
              </Button>
            )}

            {unmatched.length === 0 && transferLines.length > 0 && (
              <Button size="sm" onClick={() => completeSession(selectedSessionId)}>
                <Lock size={14} className="mr-1" /> Clôturer
              </Button>
            )}
          </div>
        )}

        {/* Lines */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Transfer lines */}
          <div>
            <h4 className="text-xs font-bold text-content-muted mb-2 uppercase">Virements attendus ({transferLines.length})</h4>
            <div className="space-y-1">
              {transferLines.length === 0 ? (
                <Card className="p-3 text-center text-xs text-content-muted">Aucun virement</Card>
              ) : transferLines.map(line => {
                const matchCfg = MATCH_CONFIG[line.matchStatus] || MATCH_CONFIG.UNMATCHED;
                return (
                  <Card key={line.id} className="p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-content-primary truncate">{line.employeNom || '—'}</span>
                      <span className="font-medium text-content-primary">{fmt(line.montant)}</span>
                      <Badge variant={matchCfg.variant} size="sm">{matchCfg.label}</Badge>
                    </div>
                    {line.matchStatus !== 'MATCHED' && canManage && sessionDetail.statut !== 'COMPLETED' && (
                      <div className="flex gap-1 mt-1">
                        <button className="text-[10px] text-accent hover:underline" onClick={() => handleIgnore(line.id)}>Ignorer</button>
                      </div>
                    )}
                    {line.matchStatus === 'MATCHED' && canManage && sessionDetail.statut !== 'COMPLETED' && (
                      <div className="flex gap-1 mt-1">
                        <button className="text-[10px] text-status-danger hover:underline" onClick={() => handleUnmatch(line.id)}>Dissocier</button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Bank lines */}
          <div>
            <h4 className="text-xs font-bold text-content-muted mb-2 uppercase">Relevé bancaire ({bankLines.length})</h4>
            <div className="space-y-1">
              {bankLines.length === 0 ? (
                <Card className="p-3 text-center text-xs text-content-muted">
                  Importez un relevé CSV pour commencer le rapprochement
                </Card>
              ) : bankLines.map(line => {
                const matchCfg = MATCH_CONFIG[line.matchStatus] || MATCH_CONFIG.UNMATCHED;
                return (
                  <Card key={line.id} className="p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-content-primary truncate">{line.reference || line.employeNom || '—'}</span>
                      <span className="font-medium text-content-primary">{fmt(line.montant)}</span>
                      <Badge variant={matchCfg.variant} size="sm">{matchCfg.label}</Badge>
                    </div>
                    {line.dateValeur && <div className="text-content-muted mt-0.5">Valeur: {line.dateValeur}</div>}
                    {line.matchStatus !== 'MATCHED' && canManage && sessionDetail.statut !== 'COMPLETED' && (
                      <div className="flex gap-1 mt-1">
                        <button className="text-[10px] text-accent hover:underline" onClick={() => handleIgnore(line.id)}>Ignorer</button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sessions list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-content-primary">Rapprochement bancaire</h3>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} className="mr-1" /> Nouvelle session
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <Card className="p-6 text-center text-content-muted text-sm">
          Aucune session de rapprochement. Créez-en une pour commencer.
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const statusCfg = STATUS_CONFIG[session.statut] || STATUS_CONFIG.DRAFT;
            return (
              <Card key={session.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-subtle transition-colors"
                onClick={() => setSelectedSessionId(session.id)}>
                <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                  <FileText size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-content-primary">{session.bankName}</span>
                    <Badge variant={statusCfg.variant} size="sm">{statusCfg.label}</Badge>
                  </div>
                  <div className="text-xs text-content-muted">
                    Période: {session.period}
                    {session.matchedCount > 0 && ` · ${session.matchedCount} rapproché(s)`}
                    {session.unmatchedCount > 0 && ` · ${session.unmatchedCount} non rapproché(s)`}
                  </div>
                </div>
                <Eye size={16} className="text-content-muted" />
              </Card>
            );
          })}
        </div>
      )}

      {/* Create session modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nouvelle session de rapprochement" size="sm">
        <div className="p-4 space-y-4">
          <FormField label="Période" name="periode" type="month" required
            value={newPeriod} onChange={e => setNewPeriod(e.target.value)} />
          <FormField label="Banque" name="bankName" required
            value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="Nom de la banque" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={isCreating || !newPeriod || !newBankName}>
              {isCreating ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Créer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
