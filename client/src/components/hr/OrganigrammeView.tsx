import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Building2, ChevronDown, ChevronRight, User, ShieldAlert,
  Search, RefreshCw, Minus, Plus, Download, GripVertical, ArrowUpFromLine, Check, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { usePermissions } from '../auth/ProtectedFeature';
import { Employe } from '../../hooks/hr/useEmployes';
import { resolveStorageUrl } from '@/lib/format';
import { toast } from '../../lib/toast';

// --- Utility pour les classes ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Interfaces ---
interface OrgNode {
  id: string;
  nom: string;
  prenom: string;
  poste: string;
  departement: string;
  email?: string;
  photoProfile?: string;
  subordinates: OrgNode[];
}

interface OrganigrammeViewProps {
  employes?: Employe[];
}

interface DragState {
  draggedId: string | null;
  draggedName: string | null;
  overId: string | null;
}

interface ReassignConfirm {
  employeId: string;
  employeName: string;
  newManagerId: string | null;
  newManagerName: string | null;
}

// --- Helper: find node name by id ---
function findNodeName(nodes: OrgNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return `${node.nom} ${node.prenom}`;
    const found = findNodeName(node.subordinates, id);
    if (found) return found;
  }
  return null;
}

// --- Helper: check if targetId is descendant of sourceId ---
function isDescendant(nodes: OrgNode[], sourceId: string, targetId: string): boolean {
  const findSubtree = (list: OrgNode[], id: string): OrgNode | null => {
    for (const n of list) {
      if (n.id === id) return n;
      const found = findSubtree(n.subordinates, id);
      if (found) return found;
    }
    return null;
  };
  const sourceNode = findSubtree(nodes, sourceId);
  if (!sourceNode) return false;
  const checkChildren = (node: OrgNode): boolean => {
    if (node.id === targetId) return true;
    return node.subordinates.some(checkChildren);
  };
  return sourceNode.subordinates.some(checkChildren);
}

// --- Composant Carte Employé (Le noeud visuel) ---
const EmployeeCard = ({
  node,
  isExpanded,
  onToggle,
  hasSubordinates,
  level,
  dragState,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  canEdit,
}: {
  node: OrgNode;
  isExpanded: boolean;
  onToggle: () => void;
  hasSubordinates: boolean;
  level: number;
  dragState: DragState;
  onDragStart: (id: string, name: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  canEdit: boolean;
}) => {
  const isDragging = dragState.draggedId === node.id;
  const isDropTarget = dragState.overId === node.id && dragState.draggedId !== node.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      draggable={canEdit}
      onDragStart={(e) => {
        const de = e as unknown as React.DragEvent;
        de.dataTransfer?.setData('text/plain', node.id);
        onDragStart(node.id, `${node.nom} ${node.prenom}`);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        const de = e as unknown as React.DragEvent;
        de.preventDefault?.();
        onDragOver(de, node.id);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        const de = e as unknown as React.DragEvent;
        de.preventDefault?.();
        onDrop(de, node.id);
      }}
      className={cn(
        "relative group flex items-center gap-4 p-3 rounded-xl border transition-all duration-300",
        level === 0
          ? "bg-gradient-to-r from-slate-800 to-slate-900 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
          : "bg-slate-800/50 hover:bg-slate-800 border-slate-700/50 hover:border-slate-600",
        isDragging && "opacity-40 scale-95",
        isDropTarget && "ring-2 ring-cyan-400 border-cyan-400/50 bg-cyan-500/10 scale-[1.02]",
        canEdit && "cursor-grab active:cursor-grabbing",
        !canEdit && (hasSubordinates ? "cursor-pointer" : "cursor-default"),
      )}
      onClick={hasSubordinates ? onToggle : undefined}
    >
      {/* Drag Handle */}
      {canEdit && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600">
          <GripVertical size={14} />
        </div>
      )}

      {/* Indicateur de hiérarchie visuel (Ligne gauche) */}
      <div className={cn(
        "absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-colors",
        isDropTarget ? "bg-cyan-400" : level === 0 ? "bg-indigo-500" : "bg-transparent group-hover:bg-slate-600"
      )} />

      {/* Avatar */}
      <div className="relative">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner overflow-hidden border-2",
          level === 0 ? "border-indigo-500 bg-indigo-600" : "border-slate-600 bg-slate-700"
        )}>
          {node.photoProfile ? (
            <img src={resolveStorageUrl(node.photoProfile)} alt={node.nom} className="w-full h-full object-cover" />
          ) : (
            <span>{node.nom.charAt(0)}{node.prenom.charAt(0)}</span>
          )}
        </div>
        {hasSubordinates && (
          <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 w-5 h-5 flex items-center justify-center rounded-full">
            {node.subordinates.length}
          </div>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <h4 className={cn("font-bold truncate", level === 0 ? "text-indigo-100" : "text-slate-200")}>
          {node.nom} {node.prenom}
        </h4>
        <p className="text-xs text-slate-400 truncate">{node.poste}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/50 px-1.5 py-0.5 rounded">
            {node.departement}
          </span>
        </div>
      </div>

      {/* Chevron d'action */}
      {hasSubordinates && (
        <div className={cn(
          "p-2 rounded-full transition-colors",
          isExpanded ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-700/50 text-slate-400 group-hover:bg-slate-700"
        )}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      )}
    </motion.div>
  );
};

// --- Composant Récursif de Branche ---
const OrgBranch = ({
  node,
  level,
  expandedNodes,
  toggleNode,
  dragState,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  canEdit,
}: {
  node: OrgNode;
  level: number;
  expandedNodes: Set<string>;
  toggleNode: (id: string) => void;
  dragState: DragState;
  onDragStart: (id: string, name: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  canEdit: boolean;
}) => {
  const hasSubordinates = node.subordinates && node.subordinates.length > 0;
  const isExpanded = expandedNodes.has(node.id);

  return (
    <div className="relative">
      <div className="relative z-10">
        <EmployeeCard
          node={node}
          level={level}
          hasSubordinates={hasSubordinates}
          isExpanded={isExpanded}
          onToggle={() => toggleNode(node.id)}
          dragState={dragState}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          canEdit={canEdit}
        />
      </div>

      <AnimatePresence>
        {hasSubordinates && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative ml-6 pl-6 overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-4 w-px bg-slate-700" />

            <div className="pt-4 space-y-4 pb-2">
              {node.subordinates.map((sub) => (
                <div key={sub.id} className="relative">
                  <div className="absolute -left-6 top-8 w-6 h-px bg-slate-700" />

                  <OrgBranch
                    node={sub}
                    level={level + 1}
                    expandedNodes={expandedNodes}
                    toggleNode={toggleNode}
                    dragState={dragState}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    canEdit={canEdit}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Confirmation Modal ---
const ReassignModal = ({
  confirm,
  onAccept,
  onCancel,
  isSubmitting,
}: {
  confirm: ReassignConfirm;
  onAccept: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
    >
      <h3 className="text-lg font-bold text-white mb-2">Confirmer le réassignement</h3>
      <p className="text-sm text-slate-400 mb-4">
        {confirm.newManagerId ? (
          <>
            Déplacer <span className="text-white font-medium">{confirm.employeName}</span> sous
            {' '}<span className="text-cyan-400 font-medium">{confirm.newManagerName}</span> ?
          </>
        ) : (
          <>
            Détacher <span className="text-white font-medium">{confirm.employeName}</span> de son manager actuel ?
            L'employé deviendra un noeud racine.
          </>
        )}
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X size={14} className="inline mr-1" />
          Annuler
        </button>
        <button
          onClick={onAccept}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg text-sm bg-cyan-600 text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {isSubmitting ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Confirmer
        </button>
      </div>
    </motion.div>
  </div>
);

// --- Vue Principale ---
export default function OrganigrammeView({ employes }: OrganigrammeViewProps) {
  const { hasPermission } = usePermissions();
  const canViewOrganigramme = hasPermission('rh', 'view');
  const canEditOrganigramme = hasPermission('rh', 'edit');

  const [orgChart, setOrgChart] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);

  // Drag state
  const [dragState, setDragState] = useState<DragState>({ draggedId: null, draggedName: null, overId: null });
  const [pendingReassign, setPendingReassign] = useState<ReassignConfirm | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);

  const fetchOrgChart = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/organigramme', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrgChart(data);
        setLastUpdated(new Date());

        if (expandedNodes.size === 0) {
          const firstLevelIds = data.map((n: OrgNode) => n.id);
          setExpandedNodes(new Set(firstLevelIds));
        }
      }
    } catch (e) {
      console.error("Erreur:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canViewOrganigramme) fetchOrgChart();
  }, [canViewOrganigramme]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) newSet.delete(nodeId);
      else newSet.add(nodeId);
      return newSet;
    });
  };

  const handleExpandAll = () => {
    const getAllParentIds = (nodes: OrgNode[]): string[] => {
      let ids: string[] = [];
      nodes.forEach(node => {
        if (node.subordinates?.length > 0) {
          ids.push(node.id);
          ids = [...ids, ...getAllParentIds(node.subordinates)];
        }
      });
      return ids;
    };
    setExpandedNodes(new Set(getAllParentIds(orgChart)));
  };

  const handleCollapseAll = () => setExpandedNodes(new Set());

  // --- Drag & Drop handlers ---
  const handleDragStart = useCallback((id: string, name: string) => {
    setDragState({ draggedId: id, draggedName: name, overId: null });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedId: null, draggedName: null, overId: null });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragState(prev => ({ ...prev, overId: id }));
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragState(prev => ({ ...prev, overId: null }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const employeId = dragState.draggedId;
    if (!employeId || employeId === targetId) {
      handleDragEnd();
      return;
    }

    // Prevent dropping on a descendant (circular)
    if (isDescendant(orgChart, employeId, targetId)) {
      toast.error("Impossible: le manager cible est un subordonné de cet employé.");
      handleDragEnd();
      return;
    }

    const targetName = findNodeName(orgChart, targetId);
    setPendingReassign({
      employeId,
      employeName: dragState.draggedName || '',
      newManagerId: targetId,
      newManagerName: targetName,
    });
    handleDragEnd();
  }, [dragState, orgChart, handleDragEnd]);

  // Drop to root zone (detach from manager)
  const handleDropToRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const employeId = dragState.draggedId;
    if (!employeId) return;

    setPendingReassign({
      employeId,
      employeName: dragState.draggedName || '',
      newManagerId: null,
      newManagerName: null,
    });
    handleDragEnd();
  }, [dragState, handleDragEnd]);

  const handleConfirmReassign = async () => {
    if (!pendingReassign) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/hr/organigramme/reassign', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeId: pendingReassign.employeId,
          newManagerId: pendingReassign.newManagerId,
        }),
      });
      if (res.ok) {
        toast.success('Hiérarchie mise à jour');
        await fetchOrgChart();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Erreur lors du réassignement');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setIsSubmitting(false);
      setPendingReassign(null);
    }
  };

  // --- Export to PNG ---
  const handleExportImage = async () => {
    if (!chartRef.current) return;
    setExporting(true);

    // Expand all before export
    handleExpandAll();

    // Wait for animations to settle
    await new Promise(r => setTimeout(r, 600));

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const link = document.createElement('a');
      link.download = `organigramme_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Organigramme exporté en PNG');
    } catch (e) {
      console.error('Export error:', e);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  if (!canViewOrganigramme) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
        <div className="p-6 bg-slate-800 rounded-full mb-6 ring-1 ring-slate-700 shadow-2xl">
          <ShieldAlert size={64} className="text-red-500" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">Accès Restreint</h3>
        <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
          Cette vue contient des informations sensibles sur la structure de l'entreprise.
          Veuillez contacter votre administrateur pour obtenir les droits d'accès.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm sticky top-2 z-30 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 rounded-xl">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">Structure</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              MAJ: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {canEditOrganigramme && (
                <span className="ml-2 text-cyan-500 text-[10px] font-medium">Glisser-déposer actif</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative group hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 w-40 focus:w-64 transition-all"
            />
          </div>

          <div className="h-8 w-px bg-slate-700 mx-1 hidden sm:block" />

          {/* Actions */}
          <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
            <button
              onClick={handleExpandAll}
              className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Tout développer"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Tout réduire"
            >
              <Minus size={18} />
            </button>
          </div>

          {/* Export PNG */}
          <button
            onClick={handleExportImage}
            disabled={exporting || orgChart.length === 0}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Exporter en PNG"
          >
            {exporting ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
          </button>

          <button
            onClick={fetchOrgChart}
            disabled={loading}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>

        {/* Mobile Search */}
        <div className="relative block sm:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher un employé..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Drop-to-root zone (visible during drag) */}
      {canEditOrganigramme && dragState.draggedId && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          onDragOver={(e) => { (e as any).preventDefault?.(); }}
          onDrop={(e) => handleDropToRoot(e as any)}
          className="border-2 border-dashed border-amber-500/40 bg-amber-500/5 rounded-xl p-4 flex items-center justify-center gap-2 text-amber-400 text-sm transition-colors hover:border-amber-400/60 hover:bg-amber-500/10"
        >
          <ArrowUpFromLine size={16} />
          Déposer ici pour détacher du manager (devenir noeud racine)
        </motion.div>
      )}

      {/* Zone Organigramme */}
      <div className="min-h-[400px]" ref={chartRef}>
        {loading && orgChart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-400 animate-pulse">Synchronisation de la structure...</p>
          </div>
        ) : orgChart.length > 0 ? (
          <div className="space-y-6 pl-1 sm:pl-4">
            {orgChart.map(node => (
              <OrgBranch
                key={node.id}
                node={node}
                level={0}
                expandedNodes={expandedNodes}
                toggleNode={toggleNode}
                dragState={dragState}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                canEdit={canEditOrganigramme}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
            <User size={64} className="text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">Aucune structure hiérarchique définie.</p>
            <p className="text-slate-600 text-sm mt-1">Commencez par ajouter des managers et des employés.</p>
          </div>
        )}
      </div>

      {/* Reassign Confirmation Modal */}
      {pendingReassign && (
        <ReassignModal
          confirm={pendingReassign}
          onAccept={handleConfirmReassign}
          onCancel={() => setPendingReassign(null)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
