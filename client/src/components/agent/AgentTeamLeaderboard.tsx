import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Star, TrendingUp, Award, Zap, Target, Crown } from 'lucide-react';
import { agentTerrainApi } from '../../lib/api-client';
import { StatutUser } from '@shared/enum/status-constants';

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
        return <Crown className="text-cyan-500" size={32} fill="currentColor" />;
      case 2:
        return <Medal className="text-slate-400" size={28} />;
      case 3:
        return <Medal className="text-emerald-600" size={24} />;
      default:
        return <span className="text-2xl font-bold text-slate-400">#{rank}</span>;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'from-cyan-500/20 to-emerald-500/20 border-cyan-500/50';
      case 2:
        return 'from-slate-400/20 to-slate-500/20 border-slate-400/50';
      case 3:
        return 'from-emerald-500/20 to-blue-500/20 border-emerald-500/50';
      default:
        return 'from-slate-700/20 to-slate-800/20 border-slate-600/50';
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
        <p className="text-slate-400 mt-4">Chargement du classement...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Classement de l'Équipe</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Performances des agents de terrain</p>
        </div>
        <div className="flex gap-2">
          {(['semaine', 'mois', 'annee'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                period === p
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {rankings.length >= 3 && (
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="flex flex-col items-center order-2 md:order-1">
            <div className="bg-gradient-to-br from-slate-400/20 to-slate-500/20 border border-slate-400/50 rounded-lg p-6 w-full text-center transform hover:scale-105 transition-transform">
              <div className="mb-3 flex justify-center">
                <Medal className="text-slate-400" size={48} />
              </div>
              <div className="text-xl font-bold text-slate-800 dark:text-white mb-1">{rankings[1].nom} {rankings[1].prenom}</div>
              <div className="text-3xl font-bold text-slate-400 mb-2">#2</div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Star className="text-cyan-500" size={16} fill="currentColor" />
                <span className="text-2xl font-bold text-slate-800 dark:text-white">{rankings[1].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-2">
                  <div className="text-slate-600 dark:text-slate-400">Collectes</div>
                  <div className="font-bold text-slate-800 dark:text-white">{rankings[1].collectes_count}</div>
                </div>
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-2">
                  <div className="text-slate-600 dark:text-slate-400">Niveau</div>
                  <div className="font-bold text-slate-800 dark:text-white">{rankings[1].niveau}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center order-1 md:order-2">
            <div className="bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/50 rounded-lg p-6 w-full text-center transform hover:scale-110 transition-transform">
              <div className="mb-3 flex justify-center">
                <Crown className="text-cyan-500" size={64} fill="currentColor" />
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-white mb-1">{rankings[0].nom} {rankings[0].prenom}</div>
              <div className="text-4xl font-bold text-cyan-500 mb-2">#1</div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Star className="text-cyan-500" size={20} fill="currentColor" />
                <span className="text-3xl font-bold text-slate-800 dark:text-white">{rankings[0].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-2">
                  <div className="text-slate-600 dark:text-slate-400">Collectes</div>
                  <div className="font-bold text-slate-800 dark:text-white">{rankings[0].collectes_count}</div>
                </div>
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-2">
                  <div className="text-slate-600 dark:text-slate-400">Niveau</div>
                  <div className="font-bold text-slate-800 dark:text-white">{rankings[0].niveau}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center order-3">
            <div className="bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/50 rounded-lg p-6 w-full text-center transform hover:scale-105 transition-transform">
              <div className="mb-3 flex justify-center">
                <Medal className="text-emerald-600" size={40} />
              </div>
              <div className="text-xl font-bold text-slate-800 dark:text-white mb-1">{rankings[2].nom} {rankings[2].prenom}</div>
              <div className="text-3xl font-bold text-emerald-600 mb-2">#3</div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Star className="text-cyan-500" size={16} fill="currentColor" />
                <span className="text-2xl font-bold text-slate-800 dark:text-white">{rankings[2].score_total}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-2">
                  <div className="text-slate-600 dark:text-slate-400">Collectes</div>
                  <div className="font-bold text-slate-800 dark:text-white">{rankings[2].collectes_count}</div>
                </div>
                <div className="bg-white/50 dark:bg-slate-900/50 rounded p-2">
                  <div className="text-slate-600 dark:text-slate-400">Niveau</div>
                  <div className="font-bold text-slate-800 dark:text-white">{rankings[2].niveau}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Classement Complet</h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {rankings.map((agent, index) => {
            const rank = index + 1;
            const isCurrentUser = agent.id === currentUserId;

            return (
              <div
                key={agent.id}
                className={`p-4 transition-colors ${
                  isCurrentUser ? 'bg-cyan-50 dark:bg-cyan-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-16 flex justify-center">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-slate-800 dark:text-white">
                        {agent.nom} {agent.prenom}
                      </span>
                      {isCurrentUser && (
                        <span className="px-2 py-1 bg-cyan-500 text-white text-xs rounded-full font-medium">Vous</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Zap className="text-cyan-500" size={14} />
                        <span className="text-slate-600 dark:text-slate-400">{agent.points} points</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target className="text-green-500" size={14} />
                        <span className="text-slate-600 dark:text-slate-400">{agent.collectes_count} collectes</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="text-blue-500" size={14} />
                        <span className="text-slate-600 dark:text-slate-400">{agent.recouvrement_taux.toFixed(0)}% recouvré</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Award className="text-emerald-500" size={14} />
                        <span className="text-slate-600 dark:text-slate-400">Niveau {agent.niveau}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-800 dark:text-white">{agent.score_total}</div>
                    <div className="text-xs text-slate-500">score total</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rankings.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg">
          <Trophy className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
          <p className="text-slate-600 dark:text-slate-400">Aucune donnée de classement disponible</p>
        </div>
      )}
    </div>
  );
}
