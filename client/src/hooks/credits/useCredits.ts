import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWebSocket } from '../useWebSocket';
import { StatutCredit } from '@shared/enum/status-constants';
import { creditKeys } from '../../lib/query-keys';

export interface Credit {
  id: string;
  numeroCredit: string;
  clientId: string;
  montantPrincipal: number;
  tauxInteret: number;
  dureeMois: number;
  montantTotal: number;
  montantEcheance: number;
  dateDeblocage: string;
  statut: string;
  nombreEcheancesPayees: number;
  nombreEcheancesTotal: number;
  joursRetard: number;
  typeCredit: string | null;
  clients?: {
    nom: string;
    phone: string;
    photoUrl?: string;
  };
}

export function useCredits() {
  const { data: credits = [], isLoading: loading, error, refetch } = useQuery<Credit[]>({
    queryKey: creditKeys.all,
    queryFn: async () => {
      const response = await fetch('/api/credits?limit=1000');
      if (!response.ok) throw new Error('Erreur serveur');
      const result = await response.json();
      return Array.isArray(result) ? result : result.data ?? [];
    }
  });

  const { socket } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    
    // Listen for manual events if needed, but Query Invalidation is handled in Context
    // This is just for debug/verification that we are receiving scoping correctly
    const handleMessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'CREDIT_UPDATE') {
                console.log('[useCredits] Received real-time update');
            }
        } catch (e) {}
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  const getStatutColor = (statut: string) => {
    const colors: Record<string, string> = {
      [StatutCredit.ACTIVE]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      [StatutCredit.CLOSED]: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      [StatutCredit.LATE]: 'bg-red-500/20 text-red-400 border-red-500/30',
      [StatutCredit.PENDING]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      [StatutCredit.PAID]: 'bg-green-500/20 text-green-400 border-green-500/30',
      [StatutCredit.CANCELLED]: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    };
    return colors[statut] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getActiveCredits = () => credits.filter(c => c.statut === StatutCredit.ACTIVE);
  
  const getCreditsEnRetard = () => credits.filter(c => c.joursRetard && c.joursRetard > 0);

  const getCreditsByClient = (clientId: string) => credits.filter(c => c.clientId === clientId);

  const searchCredits = (term: string) => {
    if (!term) return credits;
    const lower = term.toLowerCase();
    return credits.filter(c =>
      c.numeroCredit.toLowerCase().includes(lower) ||
      c.clients?.nom.toLowerCase().includes(lower) ||
      c.clients?.phone?.includes(term)
    );
  };

  return {
    credits,
    loading,
    error: error ? (error as Error).message : null,
    fetchCredits: refetch, // Alias for backward compatibility
    getStatutColor,
    getActiveCredits,
    getCreditsEnRetard,
    getCreditsByClient,
    searchCredits
  };
}
