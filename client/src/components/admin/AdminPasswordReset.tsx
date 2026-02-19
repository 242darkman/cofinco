import React, { useState } from 'react';
import { X, Key, Mail, Copy, Check, AlertCircle, AlertTriangle } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';

interface AdminPasswordResetProps {
  user: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminPasswordReset({ user, onClose, onSuccess }: AdminPasswordResetProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canResetPasswords = hasPermission('users', 'edit') || hasPermission('admin', 'manage');

  const [method, setMethod] = useState<'email_link' | 'temporary_password'>('temporary_password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      if (method === 'temporary_password') {
        const array = new Uint8Array(8);
        crypto.getRandomValues(array);
        const tempPassword = 'Temp' + Array.from(array, b => b.toString(36)).join('').slice(0, 8) + '!1A';

        const response = await fetch(`/api/users/${user.id}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'temporary_password',
            temporary_password: tempPassword
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erreur lors de la réinitialisation');
        }

        setResult({
          method: 'temporary_password',
          password: tempPassword,
          message: 'Mot de passe temporaire généré'
        });

        setTimeout(() => {
          onSuccess();
        }, 5000);

      } else {
        const response = await fetch(`/api/users/${user.id}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'email_link',
            email: user.email
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erreur lors de la génération du lien');
        }

        const data = await response.json();

        setResult({
          method: 'email_link',
          link: data.reset_link || '',
          message: 'Lien de réinitialisation généré'
        });
      }

    } catch (error: any) {
      console.error('Erreur:', error);
      setError(error.error || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-edge p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="text-accent" size={24} />
            <h3 className="text-2xl font-bold text-content-primary">
              Réinitialiser Mot de Passe
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-primary transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-surface-elevated/50 rounded-lg p-4">
            <div className="text-sm text-content-muted">Utilisateur</div>
            <div className="text-lg font-semibold text-content-primary">{user.email}</div>
            <div className="text-sm text-content-secondary">
              {user.prenom || user.raw_user_meta_data?.prenom} {user.nom || user.raw_user_meta_data?.nom}
            </div>
          </div>

          {!result && (
            <>
              <div>
                <label className="block text-sm font-semibold text-content-primary mb-3">
                  Méthode de réinitialisation
                </label>
                <div className="space-y-3">
                  <button
                    onClick={() => setMethod('temporary_password')}
                    className={`w-full p-4 rounded-lg border-2 text-left transition ${
                      method === 'temporary_password'
                        ? 'border-accent bg-accent/10'
                        : 'border-edge-strong hover:border-edge-strong'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Key className="text-accent" size={20} />
                      <div>
                        <div className="font-semibold text-content-primary">
                          Mot de passe temporaire
                        </div>
                        <div className="text-sm text-content-muted">
                          Générer un mot de passe temporaire que vous communiquerez à l'utilisateur
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setMethod('email_link')}
                    className={`w-full p-4 rounded-lg border-2 text-left transition ${
                      method === 'email_link'
                        ? 'border-status-info bg-status-info-bg'
                        : 'border-edge-strong hover:border-edge-strong'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="text-status-info" size={20} />
                      <div>
                        <div className="font-semibold text-content-primary">
                          Lien par email
                        </div>
                        <div className="text-sm text-content-muted">
                          Générer un lien de réinitialisation (à envoyer manuellement)
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-status-info-bg border border-status-info rounded-lg p-4 flex items-center gap-3 text-status-info">
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-xl font-bold transition"
                >
                  Annuler
                </button>
                {canResetPasswords ? (
                  <button
                    onClick={handleReset}
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-accent to-status-success hover:from-accent hover:to-status-success text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Key size={20} />
                    {loading ? 'Génération...' : 'Générer'}
                  </button>
                ) : (
                  <div className="flex-1 px-6 py-3 bg-status-warning-bg text-status-warning rounded-xl font-bold flex items-center justify-center gap-2">
                    <AlertTriangle size={20} />
                    Permission requise
                  </div>
                )}
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="bg-status-success-bg border border-status-success rounded-lg p-4">
                <div className="flex items-center gap-3 text-status-success mb-3">
                  <Check size={20} />
                  <span className="font-semibold">{result.error}</span>
                </div>

                {result.method === 'temporary_password' && (
                  <div className="bg-surface-elevated rounded-lg p-4 space-y-3">
                    <div className="text-sm text-content-muted">
                      Mot de passe temporaire généré :
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-surface px-4 py-3 rounded-lg text-content-primary font-mono text-lg">
                        {result.password}
                      </code>
                      <button
                        onClick={() => copyToClipboard(result.password)}
                        className="px-4 py-3 bg-status-info hover:bg-status-info text-white rounded-lg transition flex items-center gap-2"
                      >
                        {copied ? <Check size={20} /> : <Copy size={20} />}
                        {copied ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    <div className="text-sm text-accent">
                      Communiquez ce mot de passe à l'utilisateur de manière sécurisée.
                      Il devra le changer à sa prochaine connexion.
                    </div>
                  </div>
                )}

                {result.method === 'email_link' && result.link && (
                  <div className="bg-surface-elevated rounded-lg p-4 space-y-3">
                    <div className="text-sm text-content-muted">
                      Lien de réinitialisation :
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={result.link}
                        readOnly
                        className="flex-1 bg-surface px-4 py-3 rounded-lg text-content-primary text-sm"
                      />
                      <button
                        onClick={() => copyToClipboard(result.link)}
                        className="px-4 py-3 bg-status-info hover:bg-status-info text-white rounded-lg transition flex items-center gap-2"
                      >
                        {copied ? <Check size={20} /> : <Copy size={20} />}
                        {copied ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    <div className="text-sm text-status-info">
                      Envoyez ce lien à l'utilisateur par email ou SMS
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="w-full px-6 py-3 bg-status-success hover:bg-status-success text-white rounded-xl font-bold transition"
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
