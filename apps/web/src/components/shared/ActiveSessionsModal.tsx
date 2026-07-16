/**
 * Modal de gestion des sessions actives
 *
 * Permet à l'utilisateur de voir et gérer ses sessions actives:
 * - Voir tous les appareils connectés
 * - Révoquer une session spécifique
 * - Déconnecter tous les autres appareils
 */

import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Badge, ConfirmDialog } from '@/components/ui';
import { Monitor, Smartphone, Tablet, Globe, Clock, MapPin, Trash2, LogOut, Shield, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Session {
  id: string;
  sessionId: string;
  sessionIdMasked: string;
  deviceType: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string | null;
  loginAt: string;
  lastActivity: string;
  isActive: boolean;
  isCurrent: boolean;
}

interface SessionsResponse {
  sessions: Session[];
  count: number;
  maxAllowed: number;
}

const getDeviceIcon = (deviceType: string) => {
  switch (deviceType.toLowerCase()) {
    case 'mobile':
      return <Smartphone className="h-5 w-5" />;
    case 'tablet':
      return <Tablet className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
};

interface ActiveSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActiveSessionsModal({ isOpen, onClose }: ActiveSessionsModalProps) {
  const queryClient = useQueryClient();
  const [sessionToRevoke, setSessionToRevoke] = useState<Session | null>(null);
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);

  // Fetch sessions
  const { data, isLoading, error } = useQuery<SessionsResponse>({
    queryKey: ['my-sessions'],
    queryFn: async () => {
      const response = await fetch('/api/auth/my-sessions', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30s
    enabled: isOpen,
  });

  // Revoke single session
  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke session');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Session révoquée');
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      setSessionToRevoke(null);
    },
    onError: (error: Error) => {
      toast.error('Erreur', { description: error.message });
    },
  });

  // Revoke all other sessions
  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke sessions');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast.success('Sessions révoquées', {
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      setShowRevokeAllConfirm(false);
    },
    onError: (error: Error) => {
      toast.error('Erreur', { description: error.message });
    },
  });

  const sessions = data?.sessions || [];
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <span>Sessions actives</span>
          </div>
        }
        subtitle={
          data
            ? `Gérez les appareils connectés à votre compte. (${data.count}/${data.maxAllowed} sessions max)`
            : 'Gérez les appareils connectés à votre compte.'
        }
        size="lg"
        footer={
          otherSessions.length > 0 ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowRevokeAllConfirm(true)}
              disabled={revokeAllMutation.isPending}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Déconnecter tous les autres appareils
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" tone="current" className="text-content-muted" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-status-danger">
            Erreur lors du chargement des sessions
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-content-muted">Aucune session active</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`p-4 rounded-lg border ${
                  session.isCurrent
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-edge bg-surface-muted'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        session.isCurrent
                          ? 'bg-accent/10 text-accent'
                          : 'bg-surface-base text-content-muted'
                      }`}
                    >
                      {getDeviceIcon(session.deviceType)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-content-primary">
                          {session.browser} sur {session.os}
                        </span>
                        {session.isCurrent && (
                          <Badge variant="success" size="sm" className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Session actuelle
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-muted">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3.5 w-3.5" />
                          {session.ipAddress}
                        </span>
                        {session.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {session.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Dernière activité:{' '}
                          {formatDistanceToNow(new Date(session.lastActivity), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-content-muted">
                        Connecté{' '}
                        {formatDistanceToNow(new Date(session.loginAt), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </div>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-status-danger hover:text-status-danger hover:bg-status-danger/10"
                      onClick={() => setSessionToRevoke(session)}
                      disabled={revokeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Confirm revoke single session */}
      <ConfirmDialog
        isOpen={!!sessionToRevoke}
        onClose={() => setSessionToRevoke(null)}
        onConfirm={() => {
          if (sessionToRevoke) {
            revokeMutation.mutate(sessionToRevoke.sessionId);
          }
        }}
        title="Révoquer cette session ?"
        message={
          <>
            L'appareil{' '}
            <strong>
              {sessionToRevoke?.browser} sur {sessionToRevoke?.os}
            </strong>{' '}
            sera déconnecté immédiatement.
          </>
        }
        confirmText={revokeMutation.isPending ? 'Révocation...' : 'Révoquer'}
        variant="danger"
        isLoading={revokeMutation.isPending}
      />

      {/* Confirm revoke all */}
      <ConfirmDialog
        isOpen={showRevokeAllConfirm}
        onClose={() => setShowRevokeAllConfirm(false)}
        onConfirm={() => revokeAllMutation.mutate()}
        title="Déconnecter tous les autres appareils ?"
        message={`${otherSessions.length} session(s) seront révoquées. Tous vos autres appareils seront déconnectés immédiatement.`}
        confirmText={revokeAllMutation.isPending ? 'Déconnexion...' : 'Déconnecter tout'}
        variant="danger"
        isLoading={revokeAllMutation.isPending}
      />
    </>
  );
}

export default ActiveSessionsModal;
