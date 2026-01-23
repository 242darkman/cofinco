import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Key,
  RefreshCw,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Search
} from 'lucide-react';
import { Card, Button, IconButton } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface ClientWithoutCredentials {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  createdAt?: string;
}

interface GeneratedCredential {
  clientId: string;
  nom: string;
  username?: string;
  password?: string;
  error?: string;
}

export default function AdminClientCredentials() {
  const [clients, setClients] = useState<ClientWithoutCredentials[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [generatedResults, setGeneratedResults] = useState<GeneratedCredential[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const loadClientsWithoutCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/clients/without-credentials', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setClients(data.clients || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des clients'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClientsWithoutCredentials();
  }, [loadClientsWithoutCredentials]);

  const filteredClients = clients.filter(client => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${client.nom} ${client.prenom || ''}`.toLowerCase();
    const email = (client.email || '').toLowerCase();
    const phone = (client.telephone || '').toLowerCase();
    return fullName.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
  });

  const toggleSelectAll = () => {
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredClients.map(c => c.id)));
    }
  };

  const toggleSelect = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const handleGenerateCredentials = () => {
    const count = selectedClients.size || clients.length;
    openConfirm({
      title: 'Générer les identifiants ?',
      message: `Vous allez générer des identifiants de connexion pour ${count} client(s). Les mots de passe générés seront affichés une seule fois. Assurez-vous de les noter ou de les exporter.`,
      variant: 'warning',
      confirmText: 'Générer',
      onConfirm: async () => {
        setGenerating(true);
        try {
          const response = await fetch('/api/clients/generate-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              clientIds: selectedClients.size > 0 ? Array.from(selectedClients) : undefined,
            }),
          });

          if (!response.ok) throw new Error('Erreur lors de la génération');

          const data = await response.json();
          setGeneratedResults(data.results || []);
          setShowResults(true);

          if (data.generated > 0) {
            toast.success(`${data.generated} identifiant(s) générés avec succès`);
            // Recharger la liste
            loadClientsWithoutCredentials();
            setSelectedClients(new Set());
          } else {
            toast.warning('Aucun identifiant généré');
          }
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la génération'));
        } finally {
          setGenerating(false);
        }
      },
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié dans le presse-papier');
  };

  const togglePasswordVisibility = (clientId: string) => {
    const newVisible = new Set(visiblePasswords);
    if (newVisible.has(clientId)) {
      newVisible.delete(clientId);
    } else {
      newVisible.add(clientId);
    }
    setVisiblePasswords(newVisible);
  };

  const exportResults = () => {
    const successResults = generatedResults.filter(r => r.username && r.password);
    if (successResults.length === 0) {
      toast.warning('Aucun résultat à exporter');
      return;
    }

    const csvContent = [
      'Nom,Username,Mot de passe',
      ...successResults.map(r => `"${r.nom}","${r.username}","${r.password}"`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `identifiants_clients_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast.success('Export téléchargé');
  };

  return (
    <div className="space-y-4">
      <Card variant="default" padding="none" className="overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-edge bg-surface-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-500/10 rounded-xl flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 sm:w-6 sm:h-6 text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-content-primary">Accès Portail Client</h2>
                <p className="text-xs sm:text-sm text-content-muted">
                  Générer des identifiants pour les clients ({clients.length} sans accès)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={loadClientsWithoutCredentials}
                disabled={loading}
              >
                Actualiser
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={generating ? Loader2 : Key}
                onClick={handleGenerateCredentials}
                disabled={loading || generating || clients.length === 0}
                className={generating ? 'animate-pulse' : ''}
              >
                {generating ? 'Génération...' : `Générer ${selectedClients.size > 0 ? `(${selectedClients.size})` : 'Tous'}`}
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par nom, email ou téléphone..."
                className="w-full pl-10 pr-4 py-2 bg-surface-base border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="p-3 bg-blue-500/10 border-b border-blue-500/20">
          <p className="text-xs text-blue-400 flex items-center gap-2">
            <AlertTriangle size={14} />
            Ces clients ont été créés sans accès portail. Vous pouvez leur générer des identifiants de connexion.
            Le mot de passe devra être changé à la première connexion.
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-content-muted text-sm mt-3">Chargement des clients...</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <CheckCircle size={48} className="opacity-20 mb-4 text-success" />
            <p className="text-sm font-medium">Tous les clients ont un accès portail</p>
            <p className="text-xs mt-1">Aucune action requise</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full">
              <thead className="bg-surface-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedClients.size === filteredClients.length && filteredClients.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-edge text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                    Date création
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className={`hover:bg-surface-muted/30 transition-colors ${selectedClients.has(client.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedClients.has(client.id)}
                        onChange={() => toggleSelect(client.id)}
                        className="rounded border-edge text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-content-primary">
                          {client.nom} {client.prenom || ''}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {client.email && (
                          <p className="text-xs text-content-muted">{client.email}</p>
                        )}
                        {client.telephone && (
                          <p className="text-xs text-content-muted">{client.telephone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-content-muted">
                        {client.createdAt ? new Date(client.createdAt).toLocaleDateString('fr-FR') : '-'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Results Modal */}
      {showResults && generatedResults.length > 0 && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface-base rounded-xl border border-edge w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Identifiants Générés</h3>
                <p className="text-xs text-content-muted">
                  {generatedResults.filter(r => r.username).length} succès, {generatedResults.filter(r => r.error).length} erreurs
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={exportResults}
                >
                  Exporter CSV
                </Button>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-content-muted hover:text-content-primary p-1"
                >
                  <XCircle size={20} />
                </button>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border-b border-amber-500/20">
              <p className="text-xs text-amber-400 flex items-center gap-2">
                <AlertTriangle size={14} />
                Notez ces identifiants maintenant ! Les mots de passe ne seront plus visibles après fermeture.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {generatedResults.map((result) => (
                  <div
                    key={result.clientId}
                    className={`p-3 rounded-lg border ${result.error ? 'bg-red-500/5 border-red-500/30' : 'bg-success/5 border-success/30'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-content-primary">{result.nom}</p>
                        {result.error ? (
                          <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                            <XCircle size={12} /> {result.error}
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-content-muted w-20">Username:</span>
                              <code className="text-xs bg-surface-muted px-2 py-1 rounded font-mono text-primary">
                                {result.username}
                              </code>
                              <IconButton
                                icon={Copy}
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(result.username || '')}
                                className="h-6 w-6"
                                aria-label="Copier le nom d'utilisateur"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-content-muted w-20">Password:</span>
                              <code className="text-xs bg-surface-muted px-2 py-1 rounded font-mono text-content-primary">
                                {visiblePasswords.has(result.clientId) ? result.password : '••••••••••••'}
                              </code>
                              <IconButton
                                icon={visiblePasswords.has(result.clientId) ? EyeOff : Eye}
                                size="sm"
                                variant="ghost"
                                onClick={() => togglePasswordVisibility(result.clientId)}
                                className="h-6 w-6"
                                aria-label={visiblePasswords.has(result.clientId) ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                              />
                              <IconButton
                                icon={Copy}
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(result.password || '')}
                                className="h-6 w-6"
                                aria-label="Copier le mot de passe"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {!result.error && (
                        <CheckCircle size={20} className="text-success shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-edge flex justify-end">
              <Button variant="primary" onClick={() => setShowResults(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

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
