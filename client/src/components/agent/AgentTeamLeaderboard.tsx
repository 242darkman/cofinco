import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Star, TrendingUp, Target, Users, Briefcase, ArrowUpRight } from 'lucide-react';
import { Pagination } from '../ui';
import { formatMoneyShort } from '@shared/config/currency';

interface AgentRanking {
  agentId: string;
  userId: string;
  nom: string;
  prenom: string;
  photoUrl: string | null;
  score: number;
  niveau: number;
  collectesCount: number;
  collectesMontant: number;
  visitesCount: number;
  prospectionsCount: number;
  conversionsCount: number;
  objectifPct: number;
}

interface Props {
  /** The agent being viewed/supervised — used for highlighting */
  agentId?: string;
  selectedAgentId?: string;
  onAgentChange?: (id: string) => void;
}

export default function AgentTeamLeaderboard({ agentId }: Props) {
  const targetAgentId = agentId;
  const [rankings, setRankings] = useState<AgentRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'semaine' | 'mois' | 'annee'>('mois');
  const [currentUserId, setCurrentUserId] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    const cofinUserStr = localStorage.getItem('cofin_user');
    if (cofinUserStr) {
      try {
        setCurrentUserId(JSON.parse(cofinUserStr).id);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    loadRankings();
  }, [period]);

  // Real-time refresh on agent module updates
  useEffect(() => {
    const handler = () => loadRankings();
    window.addEventListener('agent-modules-update', handler);
    return () => window.removeEventListener('agent-modules-update', handler);
  }, [period]);

  const loadRankings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/agent-classement?period=${period}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur API');
      const data: AgentRanking[] = await res.json();
      setRankings(data);
    } catch (error) {
      console.error('Erreur chargement classement:', error);
      setRankings([]);
    } finally {
      setLoading(false);
    }
  };

  const isHighlighted = (agent: AgentRanking) =>
    (targetAgentId && agent.agentId === targetAgentId) || agent.userId === currentUserId;

  const MEDAL_COLORS = {
    1: { bg: '#FFD700', text: '#7A5C00', border: '#DAA520', label: 'Or' },
    2: { bg: '#C0C0C0', text: '#4A4A4A', border: '#A0A0A0', label: 'Argent' },
    3: { bg: '#CD7F32', text: '#5C3A10', border: '#A0622A', label: 'Bronze' },
  } as const;

  const MedalIcon = ({ rank, size = 24 }: { rank: 1 | 2 | 3; size?: number }) => {
    const c = MEDAL_COLORS[rank];
    return (
      <div
        className="relative flex items-center justify-center rounded-full font-black shadow-sm shrink-0"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${c.bg}, ${c.border})`,
          color: c.text,
          fontSize: size * 0.45,
          border: `2px solid ${c.border}`,
          boxShadow: `0 1px 3px ${c.border}40`,
        }}
      >
        {rank}
      </div>
    );
  };

  const getRankIcon = (rank: number) => {
    if (rank >= 1 && rank <= 3) {
      return <MedalIcon rank={rank as 1 | 2 | 3} size={28} />;
    }
    return <span className="text-lg font-bold text-content-muted w-7 text-center">#{rank}</span>;
  };

  const getNiveauLabel = (niveau: number) => {
    const labels: Record<number, string> = { 1: 'Débutant', 2: 'Actif', 3: 'Confirmé', 4: 'Expert', 5: 'Élite' };
    return labels[niveau] || `Niv. ${niveau}`;
  };

  const paginatedRankings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return rankings.slice(start, start + ITEMS_PER_PAGE);
  }, [rankings, currentPage]);

  const totalPages = Math.ceil(rankings.length / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" />
        <p className="text-content-muted mt-4 text-sm">Chargement du classement...</p>
      </div>
    );
  }

  const PodiumCard = ({ agent, rank }: { agent: AgentRanking; rank: number }) => {
    const isFirst = rank === 1;
    const highlighted = isHighlighted(agent);
    const medalColor = MEDAL_COLORS[rank as 1 | 2 | 3];
    return (
      <div className={`flex flex-col items-center ${rank === 1 ? 'order-1 md:order-2' : rank === 2 ? 'order-2 md:order-1' : 'order-3'}`}>
        <div className={`relative rounded-lg p-3 w-full text-center border transition-all ${
          isFirst
            ? 'border-edge shadow-lg p-4'
            : 'bg-surface-elevated border-edge hover:bg-surface-subtle transition-colors'
        } ${highlighted ? 'ring-2 ring-accent/40' : ''}`}
          style={isFirst ? { background: `linear-gradient(135deg, ${medalColor.bg}10, ${medalColor.bg}05)`, borderColor: `${medalColor.bg}40` } : undefined}
        >
          {isFirst && <div className="absolute top-0 inset-x-0 h-1 rounded-t-lg" style={{ background: medalColor.bg }} />}

          <div className="mb-2 flex justify-center">
            <MedalIcon rank={rank as 1 | 2 | 3} size={isFirst ? 44 : 36} />
          </div>

          <div className={`font-bold text-content-primary truncate ${isFirst ? 'text-base' : 'text-sm'}`}>
            {agent.prenom ? `${agent.prenom} ${agent.nom}` : agent.nom}
          </div>
          {highlighted && (
            <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-accent/15 text-accent text-[10px] rounded font-medium">
              {targetAgentId ? 'Supervisé' : 'Vous'}
            </span>
          )}

          <div className="flex items-center justify-center gap-1.5 my-2">
            <Star size={isFirst ? 14 : 12} fill="currentColor" style={{ color: medalColor.bg }} />
            <span className={`font-bold text-content-primary ${isFirst ? 'text-2xl' : 'text-lg'}`}>{agent.score}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="bg-surface-subtle rounded p-1.5">
              <div className="text-content-muted">Collectes</div>
              <div className="font-bold text-content-secondary">{agent.collectesCount}</div>
            </div>
            <div className="bg-surface-subtle rounded p-1.5">
              <div className="text-content-muted">Niveau</div>
              <div className="font-bold text-content-secondary">{getNiveauLabel(agent.niveau)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Classement de l'Équipe</h2>
          <p className="text-xs text-content-muted">Performances des agents de terrain</p>
        </div>
        <div className="flex bg-surface-subtle p-1 rounded-lg">
          {(['semaine', 'mois', 'annee'] as const).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content-muted hover:text-accent'
              }`}
            >
              {p === 'semaine' ? 'Semaine' : p === 'mois' ? 'Mois' : 'Année'}
            </button>
          ))}
        </div>
      </div>

      {/* Podium top 3 */}
      {rankings.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4">
          <PodiumCard agent={rankings[1]} rank={2} />
          <PodiumCard agent={rankings[0]} rank={1} />
          <PodiumCard agent={rankings[2]} rank={3} />
        </div>
      )}

      {/* Full ranking list */}
      <div className="bg-surface rounded-lg shadow-sm border border-edge-subtle">
        <div className="px-4 py-3 border-b border-edge-subtle">
          <h3 className="text-sm font-bold text-content-primary">Classement Complet</h3>
        </div>
        <div className="divide-y divide-edge-subtle/50">
          {paginatedRankings.map((agent, index) => {
            const rank = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
            const highlighted = isHighlighted(agent);

            return (
              <div
                key={agent.agentId}
                className={`px-4 py-3 transition-colors ${
                  highlighted ? 'bg-accent/8' : 'hover:bg-surface-subtle/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 flex justify-center">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-content-primary truncate">
                        {agent.prenom ? `${agent.prenom} ${agent.nom}` : agent.nom}
                      </span>
                      {highlighted && (
                        <span className="px-1.5 py-0.5 bg-accent/15 text-accent text-[10px] rounded font-medium">
                          {targetAgentId ? 'Supervisé' : 'Vous'}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 bg-surface-subtle text-content-muted text-[10px] rounded">
                        {getNiveauLabel(agent.niveau)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-center gap-1" title="Collectes réalisées">
                        <Target className="text-status-success" size={12} />
                        <span className="text-content-muted">{agent.collectesCount} coll.</span>
                      </div>
                      <div className="flex items-center gap-1" title="Volume collecté">
                        <Briefcase className="text-accent" size={12} />
                        <span className="text-content-muted">{formatMoneyShort(agent.collectesMontant)}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Visites terrain">
                        <Users className="text-status-info" size={12} />
                        <span className="text-content-muted">{agent.visitesCount} vis.</span>
                      </div>
                      <div className="flex items-center gap-1" title="Prospections / Conversions">
                        <ArrowUpRight className="text-status-warning" size={12} />
                        <span className="text-content-muted">{agent.prospectionsCount} prosp. ({agent.conversionsCount} conv.)</span>
                      </div>
                      <div className="flex items-center gap-1" title="Objectifs atteints">
                        <TrendingUp className="text-status-success" size={12} />
                        <span className="text-content-muted">{agent.objectifPct}% obj.</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-content-primary">{agent.score}</div>
                    <div className="text-[10px] text-content-muted uppercase tracking-wide">score</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="p-3 border-t border-edge-subtle flex justify-center">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              canGoNext={currentPage < totalPages}
              canGoPrevious={currentPage > 1}
              itemsPerPage={ITEMS_PER_PAGE}
              totalItems={rankings.length}
            />
          </div>
        )}
      </div>

      {rankings.length === 0 && (
        <div className="text-center py-8 bg-surface rounded-lg border border-edge-subtle border-dashed">
          <Trophy className="mx-auto text-content-secondary mb-2" size={32} />
          <p className="text-sm text-content-muted">Aucune donnée de classement disponible</p>
        </div>
      )}
    </div>
  );
}
