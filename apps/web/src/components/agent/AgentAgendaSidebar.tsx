import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, MapPin, AlertTriangle,
  ClipboardCheck, Play, Loader2, Banknote, Clock
} from 'lucide-react';

interface PlanningEntry {
  id: string;
  heureDebut: string;
  heureFin: string;
  typeActivite: string;
  zone: string;
  statut: string;
}

interface AgentAgendaSidebarProps {
  plannings: PlanningEntry[];
  enquetes: any[];
  onStartEnquete: (id: string) => void;
  onFillEnquete: (enquete: any) => void;
  onViewFullPlanning: () => void;
  startingEnquete: string | null;
}

export default function AgentAgendaSidebar({
  plannings,
  enquetes,
  onStartEnquete,
  onFillEnquete,
  onViewFullPlanning,
  startingEnquete,
}: AgentAgendaSidebarProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setPageSize(w < 400 ? 3 : w < 768 ? 4 : w < 1280 ? 5 : 8);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const allItems = useMemo(() => {
    const items: Array<{ type: 'enquete'; data: any } | { type: 'planning'; data: PlanningEntry }> = [];
    enquetes.forEach(enq => items.push({ type: 'enquete', data: enq }));
    plannings.forEach(p => items.push({ type: 'planning', data: p }));
    return items;
  }, [enquetes, plannings]);

  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedItems = allItems.slice(safePage * pageSize, (safePage + 1) * pageSize);

  useEffect(() => { setPage(0); }, [enquetes.length, plannings.length]);

  return (
    <div className="bg-surface-base border border-edge rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-edge flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-content-muted uppercase tracking-wider">
          <Calendar size={11} /> Mon agenda
        </div>
        <div className="flex items-center gap-2">
          {allItems.length > 0 && (
            <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
              {allItems.length}
            </span>
          )}
          <button
            onClick={onViewFullPlanning}
            className="text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded transition-colors"
          >
            Voir Planning
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {allItems.length > 0 ? (
          <div className="divide-y divide-edge/60">
            {paginatedItems.map((item) => {
              if (item.type === 'enquete') {
                return (
                  <EnqueteItem
                    key={`enq-${item.data.id}`}
                    enq={item.data}
                    startingEnquete={startingEnquete}
                    onStart={onStartEnquete}
                    onFill={onFillEnquete}
                  />
                );
              } else {
                return <PlanningItem key={item.data.id} p={item.data} />;
              }
            })}
          </div>
        ) : (
          <div className="px-3 py-6 text-center">
            <Calendar size={20} className="mx-auto text-content-muted mb-1" />
            <p className="text-[11px] text-content-muted">Aucune activite prevue aujourd'hui</p>
            <button
              onClick={onViewFullPlanning}
              className="mt-2 text-[10px] font-bold text-accent hover:text-accent transition-colors"
            >
              + Planifier une activite
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3 py-1.5 border-t border-edge flex items-center justify-between shrink-0">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="p-1.5 rounded-lg disabled:opacity-20 text-content-muted hover:text-content-primary hover:bg-surface active:bg-surface-elevated transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[10px] text-content-muted font-medium tabular-nums">
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="p-1.5 rounded-lg disabled:opacity-20 text-content-muted hover:text-content-primary hover:bg-surface active:bg-surface-elevated transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Enquete Item ────────────────────────────────────────────────────────

function EnqueteItem({ enq, startingEnquete, onStart, onFill }: {
  enq: any;
  startingEnquete: string | null;
  onStart: (id: string) => void;
  onFill: (enq: any) => void;
}) {
  const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
  const isAssigned = enq.statut === 'ASSIGNED';
  const isStarting = startingEnquete === enq.id;
  const borderColor =
    enq.priority === 'URGENT' ? 'bg-status-danger' :
    enq.priority === 'HIGH' ? 'bg-status-warning' :
    enq.priority === 'MEDIUM' ? 'bg-status-info' :
    'bg-surface-subtle';
  const priorityConf: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Basse', color: 'bg-surface-subtle/35 text-content-muted' },
    MEDIUM: { label: 'Normale', color: 'bg-status-info-bg text-status-info' },
    HIGH: { label: 'Haute', color: 'bg-status-warning-bg text-status-warning' },
    URGENT: { label: 'Urgente', color: 'bg-status-danger-bg text-status-danger animate-pulse' },
  };
  const pConf = priorityConf[enq.priority || 'MEDIUM'] || priorityConf.MEDIUM;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-3 ${isOverdue ? 'bg-status-danger-bg' : ''}`}>
      <div className={`w-1 self-stretch rounded-full shrink-0 ${borderColor} ${enq.priority === 'URGENT' ? 'animate-pulse' : ''}`} />
      <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-[10px] shrink-0">
        {enq.client
          ? `${(enq.client.nom || '?')[0]}${(enq.client.prenom || '')[0] || ''}`
          : '?'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-0.5">
          <ClipboardCheck size={10} className="text-status-warning shrink-0" />
          <span className="text-[10px] text-status-warning/80 font-medium">Enquête crédit</span>
        </div>
        <p className="text-xs font-semibold text-content-primary truncate">
          {enq.client
            ? `${enq.client.prenom || ''} ${enq.client.nom || ''}`.trim() || 'Client'
            : enq.clientNom || 'Client'}
        </p>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
          {enq.montantDemande && (
            <span className="text-[10px] text-status-success font-medium">
              {Number(enq.montantDemande).toLocaleString('fr-FR')} F
            </span>
          )}
          {enq.dueDate && (
            <span className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
              isOverdue
                ? 'text-status-danger font-bold bg-status-danger-bg border border-status-danger/20'
                : 'text-status-warning font-medium bg-status-warning-bg border border-status-warning/20'
            }`}>
              {isOverdue ? <AlertTriangle size={9} /> : <Calendar size={9} />}
              Échéance : {new Date(enq.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {isOverdue && ' (en retard)'}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${pConf.color}`}>
          {pConf.label}
        </span>
        {isAssigned ? (
          <button
            onClick={() => onStart(enq.id)}
            disabled={isStarting}
            className="flex items-center gap-1 px-2 py-1 bg-accent-secondary hover:bg-accent-secondary-hover disabled:bg-surface-elevated text-content-primary text-[9px] font-bold rounded-lg transition-colors"
          >
            {isStarting ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            Démarrer
          </button>
        ) : enq.statut === 'IN_PROGRESS' ? (
          <button
            onClick={() => onFill(enq)}
            className="flex items-center gap-1 px-2 py-1 bg-status-info hover:bg-status-info text-white text-[9px] font-bold rounded-lg transition-colors"
          >
            <ClipboardCheck size={10} /> Remplir
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Planning Item ───────────────────────────────────────────────────────

function PlanningItem({ p }: { p: PlanningEntry }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-3">
      <div className="text-[10px] font-mono font-bold text-content-muted w-10 shrink-0">
        {p.heureDebut}
      </div>
      <div className={`w-1 h-6 rounded-full shrink-0 ${
        p.typeActivite === 'Visite' ? 'bg-status-info' :
        p.typeActivite === 'Collecte' ? 'bg-status-success' :
        p.typeActivite === 'Prospection' ? 'bg-accent' :
        'bg-surface-subtle'
      }`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-content-primary truncate">
          {p.typeActivite}
        </div>
        {p.zone && (
          <div className="text-[10px] text-content-muted flex items-center gap-1 truncate">
            <MapPin size={8} /> {p.zone}
          </div>
        )}
      </div>
      <div className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
        p.statut === 'COMPLETED' ? 'bg-status-success-bg text-status-success' :
        p.statut === 'IN_PROGRESS' ? 'bg-status-info-bg text-status-info' :
        p.statut === 'CANCELLED' ? 'bg-status-danger-bg text-status-danger' :
        'bg-surface-elevated text-content-muted'
      }`}>
        {p.statut === 'COMPLETED' ? 'Fait' :
         p.statut === 'IN_PROGRESS' ? 'En cours' :
         p.statut === 'CANCELLED' ? 'Annule' : 'Prevu'}
      </div>
    </div>
  );
}
