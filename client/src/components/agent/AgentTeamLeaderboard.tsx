import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Medal, Star, TrendingUp, Award, Zap, Target, Crown } from 'lucide-react';
import { agentTerrainApi } from '../../lib/api-client';
import { StatutUser } from '@shared/enum/status-constants';
import { Pagination } from '../ui';

interface AgentRanking {
  id: string;
  nom: string;
  prenom: string;
  score_total: number;
  niveau: number;
  points: number;
  collectes_count: number;
  collectes_montant: number;
  presences_count: number;
  recouvrement_taux: number;
}

export default function AgentTeamLeaderboard() {
  const [rankings, setRankings] = useState<AgentRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'semaine' | 'mois' | 'annee'>('mois');
  const [currentUserId, setCurrentUserId] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    const cofinUserStr = localStorage.getItem('cofin_user');
    if (cofinUserStr) {
      const user = JSON.parse(cofinUserStr);
      setCurrentUserId(user.id);
    }
    loadRankings();
  }, [period]);

  const loadRankings = async () => {
    try {
      setLoading(true);
      const dateFilter = getDateFilter();
      const agents = await agentTerrainApi.getAllList();
      const actifs = (agents || []).filter((agent: any) => agent.statut === StatutUser.ACTIVE);

      if (!actifs || actifs.length === 0) {
        setRankings([]);
        return;
      }

      const rankingPromises = actifs.map(async (agent: any) => {
        const [gamificationRes, collectesRes, presencesRes, recouvrementsRes] = await Promise.all([
          fetch(`/api/agent-gamification/${agent.id}`),
          fetch(`/api/agent-collectes-cash?agent_id=${agent.id}&date_debut=${dateFilter}`),
          fetch(`/api/agent-presences?agent_id=${agent.id}&date_debut=${dateFilter}`),
          fetch(`/api/agent-recouvrements?agent_id=${agent.id}`)
        ]);

        const gamification = gamificationRes.ok ? await gamificationRes.json() : null;
        const collectesData = (collectesRes.ok ? await collectesRes.json() : []) || [];
        const presencesData = (presencesRes.ok ? await presencesRes.json() : []) || [];
        const recouvrementsData = (recouvrementsRes.ok ? await recouvrementsRes.json() : []) || [];

        const totalDu = recouvrementsData.reduce((sum: number, r: any) => sum + r.montant_du, 0);
        const totalRecouvre = recouvrementsData.reduce((sum: number, r: any) => sum + r.montant_recouvre, 0);

        const score_total =
          (gamification?.points_total || 0) +
          (collectesData.length * 10) +
          (presencesData.length * 5) +
          ((totalDu > 0 ? (totalRecouvre / totalDu) : 0) * 100);

        return {
          id: agent.id,
          nom: agent.nom,
          prenom: agent.prenom,
          score_total: Math.round(score_total),
          niveau: gamification?.niveau || 1,
          points: gamification?.points_total || 0,
          collectes_count: collectesData.length,
          collectes_montant: collectesData.reduce((sum: number, c: any) => sum + c.montant, 0),
          presences_count: presencesData.length,
          recouvrement_taux: totalDu > 0 ? (totalRecouvre / totalDu) * 100 : 0
        };
      });

      const rankingsData = await Promise.all(rankingPromises);
      rankingsData.sort((a, b) => b.score_total - a.score_total);

      setRankings(rankingsData);
    } catch (error) {
      console.error('Erreur chargement classement:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = () => {
    const date = new Date();
    switch (period) {
      case 'semaine':
        date.setDate(date.getDate() - 7);
        break;
      case 'mois':
        date.setMonth(date.getMonth() - 1);
        break;
      case 'annee':
        date.setFullYear(date.getFullYear() - 1);
        break;
    }
    return date.toISOString().split('T')[0];
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="text-accent" size={24} fill="currentColor" />;
      case 2:
        return <Medal className="text-content-muted" size={20} />;
      case 3:
        return <Medal className="text-status-success" size={18} />;
      default:
        return <span className="text-lg font-bold text-content-muted w-6 text-center">#{rank}</span>;
    }
  };

  // Pagination Logic
  const paginatedRankings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return rankings.slice(start, start + ITEMS_PER_PAGE);
  }, [rankings, currentPage]);

  const totalPages = Math.ceil(rankings.length / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto"></div>
        <p className="text-content-muted mt-4 text-sm">Chargement du classement...</p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-content-primary">Classement de l'Équipe</h2>
          <p className="text-xs text-content-muted">Performances des agents de terrain</p>
        </div>
        <div className="flex bg-surface-muted p-1 rounded-lg">
          {(['semaine', 'mois', 'annee'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'bg-accent-secondary text-white shadow-sm'
                  : 'text-content-muted hover:text-accent'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {rankings.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4">
          <div className="flex flex-col items-center order-2 md:order-1">
            <div className="bg-gradient-to-br from-surface-elevated/30 to-surface-subtle/10 border border-edge rounded-lg p-3 w-full text-center hover:bg-surface/50 transition-colors">
              <div className="mb-2 flex justify-center">
                <Medal className="text-content-muted" size={32} />
              </div>
              <div className="text-sm font-bold text-content-primary truncate">{rankings[1].nom}</div>
              <div className="text-xl font-bold text-content-muted mb-1">#2</div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Star className="text-accent" size={12} fill="currentColor" />
                <span className="text-lg font-bold text-content-primary">{rankings[1].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="bg-white/50/50 rounded p-1.5">
                  <div className="text-content-muted">Collectes</div>
                  <div className="font-bold text-content-secondary">{rankings[1].collectes_count}</div>
                </div>
                <div className="bg-white/50/50 rounded p-1.5">
                  <div className="text-content-muted">Niveau</div>
                  <div className="font-bold text-content-secondary">{rankings[1].niveau}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center order-1 md:order-2">
            <div className="bg-gradient-to-br from-accent/15 to-status-success/15 border border-accent/30 rounded-lg p-4 w-full text-center relative overflow-hidden transform hover:scale-[1.02] transition-transform shadow-lg shadow-accent/10">
              <div className="absolute top-0 inset-x-0 h-1 bg-accent-secondary" />
              <div className="mb-2 flex justify-center">
                <Crown className="text-accent" size={40} fill="currentColor" />
              </div>
              <div className="text-base font-bold text-content-primary truncate">{rankings[0].nom}</div>
              <div className="text-2xl font-bold text-accent mb-1">#1</div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Star className="text-accent" size={14} fill="currentColor" />
                <span className="text-2xl font-bold text-content-primary">{rankings[0].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/60/60 rounded p-1.5">
                  <div className="text-content-muted">Collectes</div>
                  <div className="font-bold text-content-secondary">{rankings[0].collectes_count}</div>
                </div>
                <div className="bg-white/60/60 rounded p-1.5">
                  <div className="text-content-muted">Niveau</div>
                  <div className="font-bold text-content-secondary">{rankings[0].niveau}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center order-3">
            <div className="bg-gradient-to-br from-status-success/10 to-status-info/10 border border-status-success/30 rounded-lg p-3 w-full text-center hover:bg-surface/50 transition-colors">
              <div className="mb-2 flex justify-center">
                <Medal className="text-status-success" size={28} />
              </div>
              <div className="text-sm font-bold text-content-primary truncate">{rankings[2].nom}</div>
              <div className="text-xl font-bold text-status-success mb-1">#3</div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Star className="text-accent" size={12} fill="currentColor" />
                <span className="text-lg font-bold text-content-primary">{rankings[2].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="bg-white/50/50 rounded p-1.5">
                  <div className="text-content-muted">Collectes</div>
                  <div className="font-bold text-content-secondary">{rankings[2].collectes_count}</div>
                </div>
                <div className="bg-white/50/50 rounded p-1.5">
                  <div className="text-content-muted">Niveau</div>
                  <div className="font-bold text-content-secondary">{rankings[2].niveau}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-lg shadow-sm border border-edge-subtle">
        <div className="px-4 py-3 border-b border-edge-subtle">
          <h3 className="text-sm font-bold text-content-primary">Classement Complet</h3>
        </div>
        <div className="divide-y divide-edge-subtle/50">
          {paginatedRankings.map((agent, index) => {
            const rank = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
            const isCurrentUser = agent.id === currentUserId;

            return (
              <div
                key={agent.id}
                className={`px-4 py-3 transition-colors ${
                  isCurrentUser ? 'bg-accent/10' : 'hover:bg-surface-muted-elevated/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 flex justify-center">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-content-primary truncate">
                        {agent.nom} {agent.prenom}
                      </span>
                      {isCurrentUser && (
                        <span className="px-1.5 py-0.5 bg-accent-secondary text-content-primary text-[10px] rounded hover:bg-accent-secondary-hover transition-colors">Vous</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Zap className="text-accent" size={12} />
                        <span className="text-content-muted">{agent.points} pts</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Target className="text-status-success" size={12} />
                        <span className="text-content-muted">{agent.collectes_count} coll.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="text-status-info" size={12} />
                        <span className="text-content-muted">{agent.recouvrement_taux.toFixed(0)}% rec.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Award className="text-status-success" size={12} />
                        <span className="text-content-muted">Niv. {agent.niveau}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-content-primary">{agent.score_total}</div>
                    <div className="text-[10px] text-content-muted uppercase tracking-wide">score</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Pagination Footer */}
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
