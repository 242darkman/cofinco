/**
 * Gestionnaire des Codes de Sécurité Caisse
 *
 * Permet aux superviseurs de:
 * - Voir les codes actifs
 * - Générer de nouveaux codes
 * - Révoquer des codes
 * - Configurer les politiques de rotation
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Shield,
  Settings,
  BarChart3,
  Eye,
  EyeOff,
  Calendar,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoney } from '../../../lib/format';

interface SecurityCode {
  id: string;
  codeType: 'EMERGENCY' | 'DAILY' | 'PERMANENT';
  agenceId?: string;
  caisseId?: string;
  active: boolean;
  expiresAt?: string;
  maxUsages?: number;
  usageCount: number;
  authorizationDurationHours: number;
  description?: string;
  createdBy: string;
  createdAt: string;
}

interface CodeStatistics {
  totalActive: number;
  totalExpired: number;
  totalByType: Record<string, number>;
  usageCountToday: number;
  expiringIn7Days: number;
}

interface RotationPolicy {
  rotationFrequencyDays: number;
  maxUsageBeforeRotation?: number;
  notifyDaysBeforeExpiry: number;
  autoGenerateOnExpiry: boolean;
}

interface SecurityCodeManagerProps {
  agenceId: string;
}

const codeTypeLabels: Record<string, { label: string; color: string; description: string }> = {
  EMERGENCY: {
    label: 'Urgence',
    color: 'text-red-400 bg-red-500/10',
    description: 'Accès ponctuel hors horaires'
  },
  DAILY: {
    label: 'Journalier',
    color: 'text-blue-400 bg-blue-500/10',
    description: 'Code rotatif quotidien'
  },
  PERMANENT: {
    label: 'Permanent',
    color: 'text-emerald-400 bg-emerald-500/10',
    description: 'Pour administrateurs'
  },
};

export default function SecurityCodeManager({ agenceId }: SecurityCodeManagerProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'codes' | 'policy' | 'stats'>('codes');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Génération de code - state
  const [newCodeType, setNewCodeType] = useState<'EMERGENCY' | 'DAILY' | 'PERMANENT'>('EMERGENCY');
  const [newCodeDescription, setNewCodeDescription] = useState('');
  const [newCodeMaxUsages, setNewCodeMaxUsages] = useState<number | undefined>();
  const [newCodeExpiresInHours, setNewCodeExpiresInHours] = useState<number | undefined>();

  // Politique - state
  const [policyDays, setPolicyDays] = useState(30);
  const [policyMaxUsage, setPolicyMaxUsage] = useState<number | undefined>();
  const [policyNotifyDays, setPolicyNotifyDays] = useState(7);
  const [policyAutoGenerate, setPolicyAutoGenerate] = useState(false);

  // Récupérer les codes actifs
  const { data: codes, isLoading: codesLoading, refetch: refetchCodes } = useQuery<SecurityCode[]>({
    queryKey: ['security-codes', agenceId],
    queryFn: async () => {
      const res = await fetch(`/api/caisses/security-codes?agenceId=${agenceId}`);
      if (!res.ok) throw new Error('Erreur récupération codes');
      return res.json();
    },
  });

  // Récupérer les statistiques
  const { data: stats } = useQuery<CodeStatistics>({
    queryKey: ['security-codes-stats', agenceId],
    queryFn: async () => {
      const res = await fetch(`/api/caisses/security-codes/statistics?agenceId=${agenceId}`);
      if (!res.ok) throw new Error('Erreur récupération stats');
      return res.json();
    },
  });

  // Récupérer la politique de rotation
  const { data: policy, isLoading: policyLoading } = useQuery<RotationPolicy>({
    queryKey: ['rotation-policy', agenceId],
    queryFn: async () => {
      const res = await fetch(`/api/caisses/security-codes/rotation-policy?agenceId=${agenceId}`);
      if (!res.ok) throw new Error('Erreur récupération politique');
      return res.json();
    },
    onSuccess: (data) => {
      setPolicyDays(data.rotationFrequencyDays);
      setPolicyMaxUsage(data.maxUsageBeforeRotation);
      setPolicyNotifyDays(data.notifyDaysBeforeExpiry);
      setPolicyAutoGenerate(data.autoGenerateOnExpiry);
    },
  });

  // Mutation générer code
  const generateMutation = useMutation({
    mutationFn: async (params: {
      codeType: string;
      description?: string;
      maxUsages?: number;
      expiresInHours?: number;
    }) => {
      const res = await fetch('/api/caisses/security-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, agenceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      queryClient.invalidateQueries({ queryKey: ['security-codes'] });
      queryClient.invalidateQueries({ queryKey: ['security-codes-stats'] });
    },
  });

  // Mutation révoquer code
  const revokeMutation = useMutation({
    mutationFn: async (codeId: string) => {
      const res = await fetch(`/api/caisses/security-codes/${codeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Révocation manuelle' }),
      });
      if (!res.ok) throw new Error('Erreur révocation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-codes'] });
      queryClient.invalidateQueries({ queryKey: ['security-codes-stats'] });
    },
  });

  // Mutation mettre à jour politique
  const updatePolicyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/caisses/security-codes/rotation-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenceId,
          rotationFrequencyDays: policyDays,
          maxUsageBeforeRotation: policyMaxUsage,
          notifyDaysBeforeExpiry: policyNotifyDays,
          autoGenerateOnExpiry: policyAutoGenerate,
        }),
      });
      if (!res.ok) throw new Error('Erreur mise à jour');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotation-policy'] });
    },
  });

  // Mutation vérifier rotation
  const checkRotationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/caisses/security-codes/check-rotation', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Erreur vérification');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-codes'] });
      queryClient.invalidateQueries({ queryKey: ['security-codes-stats'] });
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      codeType: newCodeType,
      description: newCodeDescription || undefined,
      maxUsages: newCodeMaxUsages,
      expiresInHours: newCodeExpiresInHours,
    });
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getExpiryStatus = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) return { label: 'Expiré', color: 'text-red-400' };
    if (daysLeft <= 3) return { label: `${daysLeft}j`, color: 'text-amber-400' };
    if (daysLeft <= 7) return { label: `${daysLeft}j`, color: 'text-yellow-400' };
    return { label: `${daysLeft}j`, color: 'text-slate-400' };
  };

  const tabs = [
    { id: 'codes', label: 'Codes', icon: Key },
    { id: 'policy', label: 'Politique', icon: Settings },
    { id: 'stats', label: 'Statistiques', icon: BarChart3 },
  ];

  return (
    <>
      <Card className="overflow-hidden">
        {/* En-tête */}
        <div className="px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Codes de Sécurité</h3>
              <p className="text-xs text-slate-400">Gestion des accès et rotation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => checkRotationMutation.mutate()}
              disabled={checkRotationMutation.isPending}
              icon={RefreshCw}
            >
              Vérifier
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setGeneratedCode(null);
                setNewCodeDescription('');
                setNewCodeMaxUsages(undefined);
                setNewCodeExpiresInHours(undefined);
                setShowGenerateModal(true);
              }}
              icon={Plus}
            >
              Nouveau code
            </Button>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-slate-700/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Contenu */}
        <div className="p-4">
          {/* Tab Codes */}
          {activeTab === 'codes' && (
            <div className="space-y-3">
              {codesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : codes?.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucun code actif</p>
                </div>
              ) : (
                codes?.map((code) => {
                  const typeInfo = codeTypeLabels[code.codeType] || codeTypeLabels.EMERGENCY;
                  const expiryStatus = getExpiryStatus(code.expiresAt);

                  return (
                    <motion.div
                      key={code.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-800/50 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeInfo.color}`}>
                            <Key className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                              {expiryStatus && (
                                <span className={`flex items-center gap-1 text-xs ${expiryStatus.color}`}>
                                  <Clock className="w-3 h-3" />
                                  {expiryStatus.label}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-300 mt-1">
                              {code.description || typeInfo.description}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>
                                Utilisations: {code.usageCount}
                                {code.maxUsages ? `/${code.maxUsages}` : ''}
                              </span>
                              <span>
                                Durée auth: {code.authorizationDurationHours}h
                              </span>
                              <span>
                                {new Date(code.createdAt).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (confirm('Révoquer ce code ?')) {
                              revokeMutation.mutate(code.id);
                            }
                          }}
                          disabled={revokeMutation.isPending}
                          icon={Trash2}
                        />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab Politique */}
          {activeTab === 'policy' && (
            <div className="space-y-4">
              {policyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Fréquence de rotation (jours)
                      </label>
                      <input
                        type="number"
                        value={policyDays}
                        onChange={(e) => setPolicyDays(parseInt(e.target.value) || 30)}
                        min={1}
                        max={365}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Notification avant expiration (jours)
                      </label>
                      <input
                        type="number"
                        value={policyNotifyDays}
                        onChange={(e) => setPolicyNotifyDays(parseInt(e.target.value) || 7)}
                        min={1}
                        max={30}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Max utilisations avant rotation
                      </label>
                      <input
                        type="number"
                        value={policyMaxUsage || ''}
                        onChange={(e) => setPolicyMaxUsage(parseInt(e.target.value) || undefined)}
                        placeholder="Illimité"
                        min={1}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500"
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policyAutoGenerate}
                          onChange={(e) => setPolicyAutoGenerate(e.target.checked)}
                          className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-300">
                          Auto-générer à l'expiration
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-700/50">
                    <Button
                      variant="primary"
                      onClick={() => updatePolicyMutation.mutate()}
                      isLoading={updatePolicyMutation.isPending}
                      icon={Check}
                    >
                      Enregistrer
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab Statistiques */}
          {activeTab === 'stats' && stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-emerald-400">{stats.totalActive}</div>
                  <div className="text-sm text-slate-400">Codes actifs</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-amber-400">{stats.expiringIn7Days}</div>
                  <div className="text-sm text-slate-400">Expirent sous 7j</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-400">{stats.usageCountToday}</div>
                  <div className="text-sm text-slate-400">Utilisations aujourd'hui</div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Par type</h4>
                <div className="space-y-2">
                  {Object.entries(stats.totalByType).map(([type, count]) => {
                    const typeInfo = codeTypeLabels[type] || codeTypeLabels.EMERGENCY;
                    return (
                      <div key={type} className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        <span className="text-white font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-800/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>{stats.totalExpired} codes expirés ou révoqués</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Modal Génération */}
      <AnimatePresence>
        {showGenerateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !generatedCode && setShowGenerateModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden"
            >
              <div className="px-4 py-3 bg-indigo-500/10 border-b border-slate-700">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-indigo-400" />
                  {generatedCode ? 'Code généré' : 'Nouveau code de sécurité'}
                </h3>
              </div>

              <div className="p-4">
                {generatedCode ? (
                  // Afficher le code généré
                  <div className="text-center">
                    <div className="mb-4">
                      <p className="text-slate-400 text-sm mb-2">
                        Ce code ne sera affiché qu'une seule fois
                      </p>
                      <div className="bg-slate-900 rounded-lg p-6 border-2 border-indigo-500/30">
                        <div className="text-4xl font-mono font-bold text-indigo-400 tracking-wider">
                          {generatedCode}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => handleCopy(generatedCode, 'generated')}
                      icon={copiedId === 'generated' ? Check : Copy}
                      className="w-full mb-3"
                    >
                      {copiedId === 'generated' ? 'Copié !' : 'Copier le code'}
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => setShowGenerateModal(false)}
                      className="w-full"
                    >
                      Fermer
                    </Button>
                  </div>
                ) : (
                  // Formulaire de génération
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">
                        Type de code
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['EMERGENCY', 'DAILY', 'PERMANENT'] as const).map((type) => {
                          const info = codeTypeLabels[type];
                          return (
                            <button
                              key={type}
                              onClick={() => setNewCodeType(type)}
                              className={`p-3 rounded-lg border text-center transition-colors ${
                                newCodeType === type
                                  ? `${info.color} border-current`
                                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
                              }`}
                            >
                              <div className="text-sm font-medium">{info.label}</div>
                              <div className="text-xs opacity-70 mt-0.5">{info.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Description (optionnel)
                      </label>
                      <input
                        type="text"
                        value={newCodeDescription}
                        onChange={(e) => setNewCodeDescription(e.target.value)}
                        placeholder="Ex: Accès maintenance..."
                        className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">
                          Max utilisations
                        </label>
                        <input
                          type="number"
                          value={newCodeMaxUsages || ''}
                          onChange={(e) => setNewCodeMaxUsages(parseInt(e.target.value) || undefined)}
                          placeholder="Illimité"
                          min={1}
                          className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">
                          Expire dans (heures)
                        </label>
                        <input
                          type="number"
                          value={newCodeExpiresInHours || ''}
                          onChange={(e) => setNewCodeExpiresInHours(parseInt(e.target.value) || undefined)}
                          placeholder="Par défaut"
                          min={1}
                          className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                      <Button
                        variant="ghost"
                        onClick={() => setShowGenerateModal(false)}
                        disabled={generateMutation.isPending}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleGenerate}
                        isLoading={generateMutation.isPending}
                        icon={Key}
                      >
                        Générer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
