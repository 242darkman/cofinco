import { useState, useEffect, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Send } from 'lucide-react';
import { Button, Modal, SearchableSelect } from '@/components/ui';

interface PermissionOption {
  id: string;
  code: string;
  name: string;
  moduleName?: string;
}

interface PermissionRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    permissionId: string;
    permissionCode: string;
    requestType: 'GRANT' | 'DENY' | 'TEMPORARY';
    reason: string;
    expiresAt?: string;
  }) => Promise<void>;
}

export default function PermissionRequestForm({ isOpen, onClose, onSubmit }: PermissionRequestFormProps) {
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [selectedPermId, setSelectedPermId] = useState('');
  const [requestType, setRequestType] = useState<'GRANT' | 'TEMPORARY'>('GRANT');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch only missing (requestable) permissions
  useEffect(() => {
    if (!isOpen) return;
    setLoadingPerms(true);
    fetch('/api/rbac/permissions/requestable', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setPermissions(data.permissions || []))
      .catch(() => {})
      .finally(() => setLoadingPerms(false));
  }, [isOpen]);

  const permOptions = useMemo(() =>
    permissions.map(p => ({
      value: p.id,
      label: p.name,
      subLabel: p.moduleName ? `${p.moduleName} — ${p.code}` : p.code,
      hideAvatar: true,
    })),
    [permissions]
  );

  const selectedPerm = useMemo(
    () => permissions.find(p => p.id === selectedPermId),
    [permissions, selectedPermId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerm) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        permissionId: selectedPerm.id,
        permissionCode: selectedPerm.code,
        requestType,
        reason,
        expiresAt: requestType === 'TEMPORARY' && expiresAt ? expiresAt : undefined,
      });
      // Reset form
      setSelectedPermId('');
      setReason('');
      setExpiresAt('');
      setRequestType('GRANT');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la soumission');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Demander une permission">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2 bg-status-danger-bg text-status-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Permission *
          </label>
          {loadingPerms ? (
            <div className="flex items-center gap-2 text-sm text-content-muted py-2">
              <Spinner size="xs" tone="current" />
              Chargement des permissions manquantes...
            </div>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-content-muted py-2">
              Vous disposez déjà de toutes les permissions disponibles.
            </p>
          ) : (
            <SearchableSelect
              name="permission"
              options={permOptions}
              value={selectedPermId}
              onChange={(v) => setSelectedPermId(String(v))}
              placeholder="Sélectionner une permission..."
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-content-primary mb-2">Type de demande</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="requestType"
                value="GRANT"
                checked={requestType === 'GRANT'}
                onChange={() => setRequestType('GRANT')}
                className="accent-accent"
              />
              <span className="text-sm text-content-primary">Permanente</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="requestType"
                value="TEMPORARY"
                checked={requestType === 'TEMPORARY'}
                onChange={() => setRequestType('TEMPORARY')}
                className="accent-accent"
              />
              <span className="text-sm text-content-primary">Temporaire</span>
            </label>
          </div>
        </div>

        {requestType === 'TEMPORARY' && (
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">Date d'expiration *</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              required
              min={new Date().toISOString().slice(0, 16)}
              className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Justification * <span className="text-content-muted font-normal">(min. 10 caractères)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            required
            minLength={10}
            placeholder="Expliquez pourquoi vous avez besoin de cette permission..."
            className="w-full px-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary resize-none"
          />
          <p className="text-[10px] text-content-muted mt-1">{reason.length}/10 caractères minimum</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">Annuler</Button>
          <Button
            size="sm"
            type="submit"
            disabled={!selectedPermId || reason.length < 10 || submitting || (requestType === 'TEMPORARY' && !expiresAt)}
          >
            {submitting ? <Spinner size="xs" tone="current" className="mr-1" /> : <Send size={14} className="mr-1" />}
            Soumettre
          </Button>
        </div>
      </form>
    </Modal>
  );
}
