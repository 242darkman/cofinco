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
        const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 10) + '!';

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
          message: 'Mot de passe temporaire généré avec succès'
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
          message: 'Lien de réinitialisation généré avec succès'
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
      <div className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="text-cyan-400" size={24} />
            <h3 className="text-2xl font-bold text-white">
              Réinitialiser Mot de Passe
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
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-sm text-slate-400">Utilisateur</div>
            <div className="text-lg font-semibold text-white">{user.email}</div>
            <div className="text-sm text-slate-300">
              {user.prenom || user.raw_user_meta_data?.prenom} {user.nom || user.raw_user_meta_data?.nom}
            </div>
          </div>

          {!result && (
            <>
              <div>
                <label className="block text-sm font-semibold text-white mb-3">
                  Méthode de réinitialisation
                </label>
                <div className="space-y-3">
                  <button
                    onClick={() => setMethod('temporary_password')}
                    className={`w-full p-4 rounded-lg border-2 text-left transition ${
                      method === 'temporary_password'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Key className="text-cyan-400" size={20} />
                      <div>
                        <div className="font-semibold text-white">
                          Mot de passe temporaire
                        </div>
                        <div className="text-sm text-slate-400">
                          Générer un mot de passe temporaire que vous communiquerez à l'utilisateur
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setMethod('email_link')}
                    className={`w-full p-4 rounded-lg border-2 text-left transition ${
                      method === 'email_link'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="text-blue-400" size={20} />
                      <div>
                        <div className="font-semibold text-white">
                          Lien par email
                        </div>
                        <div className="text-sm text-slate-400">
                          Générer un lien de réinitialisation (à envoyer manuellement)
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 flex items-center gap-3 text-blue-400">
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition"
                >
                  Annuler
                </button>
                {canResetPasswords ? (
                  <button
                    onClick={handleReset}
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-700 hover:to-emerald-700 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Key size={20} />
                    {loading ? 'Génération...' : 'Générer'}
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
              <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
                <div className="flex items-center gap-3 text-green-400 mb-3">
                  <Check size={20} />
                  <span className="font-semibold">{result.error}</span>
                </div>

                {result.method === 'temporary_password' && (
                  <div className="bg-slate-700 rounded-lg p-4 space-y-3">
                    <div className="text-sm text-slate-400">
                      Mot de passe temporaire généré :
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-slate-800 px-4 py-3 rounded-lg text-white font-mono text-lg">
                        {result.password}
                      </code>
                      <button
                        onClick={() => copyToClipboard(result.password)}
                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
                      >
                        {copied ? <Check size={20} /> : <Copy size={20} />}
                        {copied ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    <div className="text-sm text-cyan-400">
                      Communiquez ce mot de passe à l'utilisateur de manière sécurisée.
                      Il devra le changer à sa prochaine connexion.
                    </div>
                  </div>
                )}

                {result.method === 'email_link' && result.link && (
                  <div className="bg-slate-700 rounded-lg p-4 space-y-3">
                    <div className="text-sm text-slate-400">
                      Lien de réinitialisation :
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={result.link}
                        readOnly
                        className="flex-1 bg-slate-800 px-4 py-3 rounded-lg text-white text-sm"
                      />
                      <button
                        onClick={() => copyToClipboard(result.link)}
                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
                      >
                        {copied ? <Check size={20} /> : <Copy size={20} />}
                        {copied ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    <div className="text-sm text-blue-400">
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
