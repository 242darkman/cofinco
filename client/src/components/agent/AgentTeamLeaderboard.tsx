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
        return <Crown className="text-cyan-500" size={24} fill="currentColor" />;
      case 2:
        return <Medal className="text-slate-400" size={20} />;
      case 3:
        return <Medal className="text-emerald-600" size={18} />;
      default:
        return <span className="text-lg font-bold text-slate-400 w-6 text-center">#{rank}</span>;
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto"></div>
        <p className="text-slate-400 mt-4 text-sm">Chargement du classement...</p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Classement de l'Équipe</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Performances des agents de terrain</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['semaine', 'mois', 'annee'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400'
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
            <div className="bg-gradient-to-br from-slate-400/10 to-slate-500/10 border border-slate-400/30 rounded-lg p-3 w-full text-center hover:bg-slate-800/50 transition-colors">
              <div className="mb-2 flex justify-center">
                <Medal className="text-slate-400" size={32} />
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-white truncate">{rankings[1].nom}</div>
              <div className="text-xl font-bold text-slate-400 mb-1">#2</div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Star className="text-cyan-500" size={12} fill="currentColor" />
                <span className="text-lg font-bold text-slate-800 dark:text-white">{rankings[1].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-1.5">
                  <div className="text-slate-500">Collectes</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200">{rankings[1].collectes_count}</div>
                </div>
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-1.5">
                  <div className="text-slate-500">Niveau</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200">{rankings[1].niveau}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center order-1 md:order-2">
            <div className="bg-gradient-to-br from-cyan-500/15 to-emerald-500/15 border border-cyan-500/30 rounded-lg p-4 w-full text-center relative overflow-hidden transform hover:scale-[1.02] transition-transform shadow-lg shadow-cyan-900/10">
              <div className="absolute top-0 inset-x-0 h-1 bg-cyan-500" />
              <div className="mb-2 flex justify-center">
                <Crown className="text-cyan-500" size={40} fill="currentColor" />
              </div>
              <div className="text-base font-bold text-slate-800 dark:text-white truncate">{rankings[0].nom}</div>
              <div className="text-2xl font-bold text-cyan-500 mb-1">#1</div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Star className="text-cyan-500" size={14} fill="currentColor" />
                <span className="text-2xl font-bold text-slate-800 dark:text-white">{rankings[0].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/60 dark:bg-slate-900/60 rounded p-1.5">
                  <div className="text-slate-500">Collectes</div>
                  <div className="font-bold text-slate-700 dark:text-slate-100">{rankings[0].collectes_count}</div>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 rounded p-1.5">
                  <div className="text-slate-500">Niveau</div>
                  <div className="font-bold text-slate-700 dark:text-slate-100">{rankings[0].niveau}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center order-3">
            <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-lg p-3 w-full text-center hover:bg-slate-800/50 transition-colors">
              <div className="mb-2 flex justify-center">
                <Medal className="text-emerald-600" size={28} />
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-white truncate">{rankings[2].nom}</div>
              <div className="text-xl font-bold text-emerald-600 mb-1">#3</div>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Star className="text-cyan-500" size={12} fill="currentColor" />
                <span className="text-lg font-bold text-slate-800 dark:text-white">{rankings[2].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-1.5">
                  <div className="text-slate-500">Collectes</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200">{rankings[2].collectes_count}</div>
                </div>
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-1.5">
                  <div className="text-slate-500">Niveau</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200">{rankings[2].niveau}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700/50">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/50">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Classement Complet</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {paginatedRankings.map((agent, index) => {
            const rank = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
            const isCurrentUser = agent.id === currentUserId;

            return (
              <div
                key={agent.id}
                className={`px-4 py-3 transition-colors ${
                  isCurrentUser ? 'bg-cyan-50/50 dark:bg-cyan-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 flex justify-center">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-slate-800 dark:text-white truncate">
                        {agent.nom} {agent.prenom}
                      </span>
                      {isCurrentUser && (
                        <span className="px-1.5 py-0.5 bg-cyan-500 text-white text-[10px] rounded hover:bg-cyan-600 transition-colors">Vous</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Zap className="text-cyan-500" size={12} />
                        <span className="text-slate-500 dark:text-slate-400">{agent.points} pts</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Target className="text-green-500" size={12} />
                        <span className="text-slate-500 dark:text-slate-400">{agent.collectes_count} coll.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="text-blue-500" size={12} />
                        <span className="text-slate-500 dark:text-slate-400">{agent.recouvrement_taux.toFixed(0)}% rec.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Award className="text-emerald-500" size={12} />
                        <span className="text-slate-500 dark:text-slate-400">Niv. {agent.niveau}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-slate-800 dark:text-white">{agent.score_total}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">score</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Pagination Footer */}
        {totalPages > 1 && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-700/50 flex justify-center">
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
        <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50 border-dashed">
          <Trophy className="mx-auto text-slate-300 dark:text-slate-600 mb-2" size={32} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune donnée de classement disponible</p>
        </div>
      )}
    </div>
  );
}
