import React, { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap, Award, TrendingUp, CheckCircle, Clock,
  ExternalLink, Download, Star, ChevronLeft, ChevronRight,
  Eye, AlertTriangle, Shield, FileCheck, Users, MapPin, Calendar,
} from 'lucide-react';
import { StatutSuiviFormation, STATUT_SUIVI_FORMATION_LABELS } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Formation {
  id: number;
  titre: string;
  description: string | null;
  typeFormation: string | null;
  dureeHeures: number | null;
  contenuUrl: string | null;
  obligatoire: boolean | null;
  statut: string | null;
  formateur: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  lieu: string | null;
  programme: string | null;
  capaciteMax: number | null;
  participants: number;
  createdAt: string;
}

interface FormationSuivi {
  id: string;
  agentId: string | null;
  formationId: number;
  dateDebut: string | null;
  dateFin: string | null;
  progression: number | null;
  statut: string | null;
  presence: string | null;
  createdAt: string | null;
  scoreEvaluation: number | null;
  evaluation: string | null;
  competencesAcquises: string | null;
  recommandation: string | null;
  evaluatedAt: string | null;
  formation?: {
    id: number;
    titre: string;
    description: string | null;
    typeFormation: string | null;
    dureeHeures: number | null;
    contenuUrl: string | null;
    obligatoire: boolean | null;
    statut: string | null;
    dateFin: string | null;
  };
  certificate: {
    id: string;
    numero: string;
    statut: string;
    fichierUrl: string | null;
    dateExpiration: string | null;
  } | null;
}

interface ComplianceData {
  mandatoryNotEnrolled: Array<{ id: number; titre: string; dateDebut: string | null; dateFin: string | null }>;
  overdue: Array<{ id: number; titre: string; dateFin: string | null; progression: number }>;
  expiringCertificates: Array<{ id: string; titre: string; numero: string; dateExpiration: string | null }>;
  complianceScore: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AgentFormations({ agentId }: { agentId?: string }) {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [suivis, setSuivis] = useState<FormationSuivi[]>([]);
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [fRes, sRes] = await Promise.all([
        fetch('/api/agent-formations', { credentials: 'include' }),
        agentId ? fetch(`/api/agent-formations-suivi?agent_id=${agentId}`, { credentials: 'include' }) : null,
      ]);

      if (fRes.ok) setFormations(await fRes.json());
      if (sRes?.ok) setSuivis(await sRes.json());

      if (agentId) {
        const cRes = await fetch(`/api/agent-formations-compliance?agent_id=${agentId}`, { credentials: 'include' });
        if (cRes.ok) setCompliance(await cRes.json());
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // WebSocket: real-time sync with HR module
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || detail.entity === 'formation') loadAll();
    };
    window.addEventListener('agent-modules-update', handler);
    window.addEventListener('agent-formation-update', handler);
    return () => {
      window.removeEventListener('agent-modules-update', handler);
      window.removeEventListener('agent-formation-update', handler);
    };
  }, [loadAll]);

  const inscrireFormation = async (formationId: number) => {
    if (!agentId) return;
    try {
      const response = await fetch('/api/agent-formations-suivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: agentId,
          formation_id: formationId,
          date_debut: new Date().toISOString().slice(0, 10),
          progression: 0,
          statut: 'IN_PROGRESS',
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur inscription');
      }
      loadAll();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const updateProgression = async (suiviId: string, progression: number) => {
    try {
      const statut = progression >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
      const body: Record<string, unknown> = {
        progression,
        statut,
        ...(progression >= 100 && { date_fin: new Date().toISOString().slice(0, 10) }),
      };
      const response = await fetch(`/api/agent-formations-suivi/${suiviId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Erreur mise à jour');
      loadAll();
    } catch (error: any) {
      alert(error.message);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────
  const formationsCompletes = suivis.filter(s => s.statut === 'COMPLETED').length;
  const enCours = suivis.filter(s => s.statut === StatutSuiviFormation.IN_PROGRESS).length;
  const progressionMoyenne = suivis.length > 0
    ? suivis.reduce((sum, s) => sum + (s.progression || 0), 0) / suivis.length
    : 0;

  const totalPages = Math.ceil(formations.length / ITEMS_PER_PAGE);
  const paginatedFormations = formations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const enrolledSet = new Set(suivis.map(s => s.formationId));
  const selectedSuivi = selectedFormation ? suivis.find(s => s.formationId === selectedFormation.id) : null;

  const hasComplianceIssues = compliance && (
    compliance.mandatoryNotEnrolled.length > 0 ||
    compliance.overdue.length > 0 ||
    compliance.expiringCertificates.length > 0
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compliance Banner */}
      {hasComplianceIssues && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-bg p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-status-warning shrink-0" />
            <span className="text-xs font-bold text-status-warning">Conformité — Actions requises</span>
            {compliance && (
              <span className="ml-auto text-[10px] font-bold text-status-warning bg-status-warning/15 px-1.5 py-0.5 rounded">
                {compliance.complianceScore}%
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-content-secondary">
            {compliance!.mandatoryNotEnrolled.length > 0 && (
              <span>{compliance!.mandatoryNotEnrolled.length} formation{compliance!.mandatoryNotEnrolled.length > 1 ? 's' : ''} obligatoire{compliance!.mandatoryNotEnrolled.length > 1 ? 's' : ''} non inscrite{compliance!.mandatoryNotEnrolled.length > 1 ? 's' : ''}</span>
            )}
            {compliance!.overdue.length > 0 && (
              <span className="text-status-danger">{compliance!.overdue.length} en retard</span>
            )}
            {compliance!.expiringCertificates.length > 0 && (
              <span>{compliance!.expiringCertificates.length} certificat{compliance!.expiringCertificates.length > 1 ? 's' : ''} expire{compliance!.expiringCertificates.length > 1 ? 'nt' : ''} bientôt</span>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<GraduationCap size={14} />} label="Disponibles" value={formations.length.toString()} variant="info" />
        <StatCard icon={<CheckCircle size={14} />} label="Complétées" value={formationsCompletes.toString()} variant="success" />
        <StatCard icon={<Clock size={14} />} label="En Cours" value={enCours.toString()} variant="accent" />
        <StatCard icon={<TrendingUp size={14} />} label="Progression" value={`${progressionMoyenne.toFixed(0)}%`} variant="accent" />
      </div>

      {/* Mes Formations (enrolled) */}
      {agentId && suivis.length > 0 && (
        <div className="bg-surface rounded-lg border border-edge-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-edge-subtle">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <Award size={16} className="text-status-success" />
              Mes Formations
            </h3>
          </div>
          <div className="divide-y divide-edge-subtle/50">
            {suivis.map((suivi) => (
              <div key={suivi.id} className="p-3 hover:bg-surface-subtle/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-bold text-content-primary truncate">{suivi.formation?.titre}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                        suivi.statut === 'COMPLETED' ? 'bg-status-success-bg text-status-success' :
                        suivi.statut === StatutSuiviFormation.IN_PROGRESS ? 'bg-status-info-bg text-status-info' :
                        'bg-surface-subtle text-content-muted'
                      }`}>
                        {STATUT_SUIVI_FORMATION_LABELS[suivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS] || suivi.statut}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 h-1.5 bg-surface-elevated rounded-full max-w-48">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${suivi.progression || 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-content-muted font-bold w-8">{suivi.progression || 0}%</span>
                    </div>

                    {/* Evaluation + Certificate badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {suivi.scoreEvaluation != null && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-surface-subtle rounded text-[10px]">
                          <Star size={10} className="text-status-warning" />
                          <span className={`font-bold ${suivi.scoreEvaluation >= 70 ? 'text-status-success' : 'text-status-warning'}`}>
                            {suivi.scoreEvaluation}/100
                          </span>
                        </span>
                      )}
                      {suivi.recommandation && (
                        <span className="px-1.5 py-0.5 bg-surface-subtle rounded text-[10px] text-content-muted truncate max-w-32">
                          {suivi.recommandation}
                        </span>
                      )}
                      {suivi.certificate && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          suivi.certificate.statut === 'ISSUED'
                            ? 'bg-status-success-bg text-status-success'
                            : 'bg-status-danger-bg text-status-danger'
                        }`}>
                          <FileCheck size={10} />
                          {suivi.certificate.numero}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Certificate download */}
                  {suivi.certificate?.fichierUrl && suivi.certificate.statut === 'ISSUED' && (
                    <a
                      href={suivi.certificate.fichierUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-status-success hover:bg-status-success-bg rounded transition-colors shrink-0"
                      title="Télécharger le certificat"
                    >
                      <Download size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catalogue de Formations */}
      <div className="bg-surface rounded-lg border border-edge-subtle overflow-hidden">
        <div className="px-4 py-3 border-b border-edge-subtle flex items-center justify-between">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <GraduationCap size={16} className="text-status-info" />
            Catalogue de Formations
          </h3>
          <span className="text-[10px] text-content-muted font-medium">{formations.length} formations</span>
        </div>

        {formations.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <GraduationCap size={32} className="mx-auto mb-2 text-content-muted" />
            <p className="text-sm text-content-muted">Aucune formation disponible</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 p-2">
            {paginatedFormations.map((formation) => {
              const isEnrolled = enrolledSet.has(formation.id);
              const isFull = formation.capaciteMax != null && formation.participants >= formation.capaciteMax;
              return (
                <div
                  key={formation.id}
                  onClick={() => setSelectedFormation(formation)}
                  className={`rounded-lg p-3 border transition cursor-pointer group ${
                    isEnrolled
                      ? 'bg-status-success-bg/30 border-status-success/20'
                      : 'bg-surface-subtle border-edge-subtle hover:border-edge'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isEnrolled ? 'bg-status-success-bg' : 'bg-status-info-bg'
                    }`}>
                      <GraduationCap size={14} className={isEnrolled ? 'text-status-success' : 'text-status-info'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-content-primary truncate">{formation.titre}</h4>
                      {formation.formateur && (
                        <p className="text-[10px] text-content-muted truncate">{formation.formateur}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {formation.obligatoire && (
                        <span className="px-1.5 py-0.5 bg-status-warning-bg text-status-warning rounded text-[8px] font-bold uppercase">Requis</span>
                      )}
                      {isEnrolled && (
                        <CheckCircle size={14} className="text-status-success" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-content-muted">
                    <div className="flex items-center gap-2">
                      <span className="text-accent font-bold">{formation.typeFormation || 'Formation'}</span>
                      <span>•</span>
                      <span>{formation.dureeHeures || '?'}h</span>
                      {formation.lieu && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-0.5"><MapPin size={9} />{formation.lieu}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {formation.capaciteMax && (
                        <span className={`flex items-center gap-0.5 ${isFull ? 'text-status-danger' : ''}`}>
                          <Users size={9} />
                          {formation.participants}/{formation.capaciteMax}
                        </span>
                      )}
                      <Eye size={12} className="text-content-muted group-hover:text-accent" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-edge-subtle">
            <span className="text-[10px] text-content-muted">Page {currentPage}/{totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedFormation} onOpenChange={(open) => !open && setSelectedFormation(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface border-l border-edge p-0 overflow-y-auto">
          {selectedFormation && (
            <FormationDetailSheet
              formation={selectedFormation}
              suivi={selectedSuivi || undefined}
              agentId={agentId}
              onInscrire={() => {
                inscrireFormation(selectedFormation.id);
                setSelectedFormation(null);
              }}
              onUpdateProgression={updateProgression}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL SHEET
// ═══════════════════════════════════════════════════════════════════════════

function FormationDetailSheet({
  formation,
  suivi,
  agentId,
  onInscrire,
  onUpdateProgression,
}: {
  formation: Formation;
  suivi?: FormationSuivi;
  agentId?: string;
  onInscrire: () => void;
  onUpdateProgression: (suiviId: string, progression: number) => void;
}) {
  const isFull = formation.capaciteMax != null && formation.participants >= formation.capaciteMax;
  const canEnroll = agentId && !suivi && !isFull;

  return (
    <>
      <SheetHeader className="px-6 py-4 border-b border-edge sticky top-0 z-10 bg-surface">
        <SheetTitle className="text-content-primary flex items-center gap-2">
          <GraduationCap size={16} className="text-status-info" />
          {formation.titre}
        </SheetTitle>
        <SheetDescription className="text-content-muted">
          {formation.typeFormation || 'Formation'} • {formation.dureeHeures || '?'}h
          {formation.formateur && ` • ${formation.formateur}`}
        </SheetDescription>
      </SheetHeader>

      <div className="p-6 space-y-5">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-1 bg-status-info-bg text-status-info rounded text-xs font-bold">{formation.typeFormation || 'Formation'}</span>
          <span className="px-2 py-1 bg-surface-elevated text-content-secondary rounded text-xs">{formation.dureeHeures || '?'}h</span>
          {formation.obligatoire && (
            <span className="px-2 py-1 bg-status-warning-bg text-status-warning rounded text-xs font-bold">Obligatoire</span>
          )}
          {formation.statut && (
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              formation.statut === 'IN_PROGRESS' ? 'bg-status-info-bg text-status-info' :
              formation.statut === 'COMPLETED' ? 'bg-status-success-bg text-status-success' :
              formation.statut === 'PLANNED' ? 'bg-surface-subtle text-content-muted' :
              'bg-surface-subtle text-content-muted'
            }`}>
              {formation.statut}
            </span>
          )}
        </div>

        {/* Formation info */}
        <div className="space-y-2">
          {(formation.dateDebut || formation.dateFin || formation.lieu) && (
            <div className="flex flex-wrap gap-3 text-xs text-content-secondary">
              {formation.dateDebut && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="text-content-muted" />
                  {new Date(formation.dateDebut).toLocaleDateString('fr-FR')}
                  {formation.dateFin && ` – ${new Date(formation.dateFin).toLocaleDateString('fr-FR')}`}
                </span>
              )}
              {formation.lieu && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-content-muted" />
                  {formation.lieu}
                </span>
              )}
            </div>
          )}
          {formation.capaciteMax && (
            <div className="flex items-center gap-1 text-xs text-content-muted">
              <Users size={12} />
              <span>{formation.participants}/{formation.capaciteMax} inscrits</span>
              {isFull && <span className="text-status-danger font-bold ml-1">— Complet</span>}
            </div>
          )}
        </div>

        {/* Description */}
        {formation.description && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-content-muted uppercase">Description</h4>
            <p className="text-sm text-content-secondary leading-relaxed">{formation.description}</p>
          </div>
        )}

        {/* Programme */}
        {formation.programme && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-content-muted uppercase">Programme</h4>
            <div className="text-sm text-content-secondary leading-relaxed whitespace-pre-wrap">{formation.programme}</div>
          </div>
        )}

        {/* Progression (if enrolled) */}
        {suivi && (
          <div className="space-y-3 p-4 bg-surface-subtle border border-edge-subtle rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-content-muted uppercase">Ma progression</h4>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                suivi.statut === 'COMPLETED' ? 'bg-status-success-bg text-status-success' :
                'bg-status-info-bg text-status-info'
              }`}>
                {STATUT_SUIVI_FORMATION_LABELS[suivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS] || suivi.statut}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-content-muted mb-1">
                <span>Avancement</span>
                <span className="font-bold text-content-primary">{suivi.progression || 0}%</span>
              </div>
              <div className="w-full bg-surface-elevated rounded-full h-2">
                <div
                  className="bg-accent h-full rounded-full transition-all"
                  style={{ width: `${suivi.progression || 0}%` }}
                />
              </div>
            </div>

            {suivi.statut === StatutSuiviFormation.IN_PROGRESS && (
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={suivi.progression || 0}
                  onChange={(e) => {
                    const prog = Number(e.target.value);
                    onUpdateProgression(suivi.id, prog);
                  }}
                  className="w-full"
                />
                {(suivi.progression || 0) >= 95 && (
                  <button
                    onClick={() => onUpdateProgression(suivi.id, 100)}
                    className="w-full py-2 bg-status-success text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition hover:opacity-90"
                  >
                    <Award size={14} />
                    Marquer comme terminée
                  </button>
                )}
              </div>
            )}

            {/* Evaluation from HR */}
            {suivi.scoreEvaluation != null && (
              <div className="p-3 bg-surface rounded-lg border border-edge-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-content-muted uppercase flex items-center gap-1">
                    <Star size={12} className="text-status-warning" />
                    Évaluation RH
                  </h5>
                  <span className={`text-lg font-bold ${suivi.scoreEvaluation >= 70 ? 'text-status-success' : suivi.scoreEvaluation >= 50 ? 'text-status-warning' : 'text-status-danger'}`}>
                    {suivi.scoreEvaluation}/100
                  </span>
                </div>
                {suivi.evaluation && (
                  <p className="text-xs text-content-secondary">{suivi.evaluation}</p>
                )}
                {suivi.recommandation && (
                  <p className="text-xs text-content-muted italic">Recommandation : {suivi.recommandation}</p>
                )}
                {suivi.competencesAcquises && (
                  <div className="flex flex-wrap gap-1">
                    {(typeof suivi.competencesAcquises === 'string'
                      ? (() => { try { return JSON.parse(suivi.competencesAcquises); } catch { return [suivi.competencesAcquises]; } })()
                      : [suivi.competencesAcquises]
                    ).map((c: string, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[10px] font-medium">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Certificate */}
            {suivi.certificate && (
              <div className={`p-3 rounded-lg border space-y-1.5 ${
                suivi.certificate.statut === 'ISSUED'
                  ? 'bg-status-success-bg/50 border-status-success/20'
                  : 'bg-status-danger-bg/50 border-status-danger/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileCheck size={14} className={suivi.certificate.statut === 'ISSUED' ? 'text-status-success' : 'text-status-danger'} />
                    <span className="text-xs font-bold text-content-primary">Certificat</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${
                    suivi.certificate.statut === 'ISSUED' ? 'text-status-success' : 'text-status-danger'
                  }`}>
                    {suivi.certificate.statut === 'ISSUED' ? 'Valide' : suivi.certificate.statut}
                  </span>
                </div>
                <p className="text-[10px] text-content-muted font-mono">{suivi.certificate.numero}</p>
                {suivi.certificate.dateExpiration && (
                  <p className="text-[10px] text-content-muted">
                    Expire le {new Date(suivi.certificate.dateExpiration).toLocaleDateString('fr-FR')}
                  </p>
                )}
                {suivi.certificate.fichierUrl && suivi.certificate.statut === 'ISSUED' && (
                  <a
                    href={suivi.certificate.fichierUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 px-2 py-1 bg-status-success text-white rounded text-[10px] font-bold hover:opacity-90 transition"
                  >
                    <Download size={10} />
                    Télécharger
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content URL */}
        {formation.contenuUrl && (
          <a
            href={formation.contenuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-status-info text-white rounded-lg font-bold text-sm transition hover:opacity-90"
          >
            <ExternalLink size={16} />
            Accéder au contenu
          </a>
        )}

        {/* Enroll Button */}
        {canEnroll && (
          <button
            onClick={onInscrire}
            className="w-full py-2.5 bg-status-success text-white rounded-lg font-bold text-sm transition hover:opacity-90"
          >
            S'inscrire à cette formation
          </button>
        )}
        {agentId && !suivi && isFull && (
          <div className="text-center py-2 text-xs text-status-danger flex items-center justify-center gap-1">
            <AlertTriangle size={12} />
            Formation complète — aucune place disponible
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, variant }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant: 'info' | 'success' | 'accent';
}) {
  const cls = {
    info: 'from-status-info/15 to-status-info/5 border-status-info/20 text-status-info',
    success: 'from-status-success/15 to-status-success/5 border-status-success/20 text-status-success',
    accent: 'from-accent/15 to-accent/5 border-accent/20 text-accent',
  }[variant];

  return (
    <div className={`rounded-lg p-3 border bg-gradient-to-br ${cls}`}>
      <div className="mb-1">{icon}</div>
      <div className="text-lg font-bold text-content-primary truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}
