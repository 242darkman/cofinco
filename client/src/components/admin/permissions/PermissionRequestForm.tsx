import { useState, useEffect, useMemo } from 'react';
import { Shield, Loader2, Send } from 'lucide-react';
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

  // Fetch available permissions
  useEffect(() => {
    if (!isOpen) return;
    setLoadingPerms(true);
    fetch('/api/permissions', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setPermissions(data))
      .catch(() => {})
      .finally(() => setLoadingPerms(false));
  }, [isOpen]);

  const permOptions = useMemo(() =>
    permissions.map(p => ({
      value: p.id,
      label: `${p.name} (${p.code})`,
      description: p.moduleName,
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
              <Loader2 size={14} className="animate-spin" />
              Chargement...
            </div>
          ) : (
            <SearchableSelect
              options={permOptions}
              value={selectedPermId}
              onChange={setSelectedPermId}
              placeholder="Sélectionner une permission..."
              searchPlaceholder="Rechercher par nom ou code..."
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
            {submitting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Send size={14} className="mr-1" />}
            Soumettre
          </Button>
        </div>
      </form>
    </Modal>
  );
}
