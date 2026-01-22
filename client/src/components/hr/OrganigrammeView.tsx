import React, { useEffect, useState, useMemo } from 'react';
import {
  Building2, ChevronDown, ChevronRight, User, ShieldAlert,
  Search, RefreshCw, Minus, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { usePermissions } from '../auth/ProtectedFeature';
import { Employe } from '../../hooks/hr/useEmployes';
import { resolveStorageUrl } from '@/lib/format';

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

// --- Composant Carte Employé (Le noeud visuel) ---
const EmployeeCard = ({ 
  node, 
  isExpanded, 
  onToggle, 
  hasSubordinates, 
  level 
}: { 
  node: OrgNode; 
  isExpanded: boolean; 
  onToggle: () => void; 
  hasSubordinates: boolean;
  level: number;
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative group flex items-center gap-4 p-3 rounded-xl border transition-all duration-300 cursor-pointer",
        // Design différent pour le Top Management (Niveau 0)
        level === 0 
          ? "bg-gradient-to-r from-slate-800 to-slate-900 border-indigo-500/50 shadow-lg shadow-indigo-500/10" 
          : "bg-slate-800/50 hover:bg-slate-800 border-slate-700/50 hover:border-slate-600"
      )}
      onClick={hasSubordinates ? onToggle : undefined}
    >
      {/* Indicateur de hiérarchie visuel (Ligne gauche) */}
      <div className={cn(
        "absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-colors",
        level === 0 ? "bg-indigo-500" : "bg-transparent group-hover:bg-slate-600"
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
        {/* Badge Subordonnés */}
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
  toggleNode 
}: { 
  node: OrgNode; 
  level: number; 
  expandedNodes: Set<string>; 
  toggleNode: (id: string) => void; 
}) => {
  const hasSubordinates = node.subordinates && node.subordinates.length > 0;
  const isExpanded = expandedNodes.has(node.id);

  return (
    <div className="relative">
      {/* Carte du noeud actuel */}
      <div className="relative z-10">
        <EmployeeCard 
          node={node} 
          level={level} 
          hasSubordinates={hasSubordinates}
          isExpanded={isExpanded}
          onToggle={() => toggleNode(node.id)}
        />
      </div>

      {/* Rendu des enfants avec animation et lignes connectrices */}
      <AnimatePresence>
        {hasSubordinates && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative ml-6 pl-6 overflow-hidden"
          >
            {/* Ligne connectrice verticale principale */}
            <div className="absolute left-0 top-0 bottom-4 w-px bg-slate-700" />
            
            <div className="pt-4 space-y-4 pb-2">
              {node.subordinates.map((sub) => (
                <div key={sub.id} className="relative">
                  {/* Ligne connectrice horizontale vers l'enfant */}
                  <div className="absolute -left-6 top-8 w-6 h-px bg-slate-700" />
                  
                  <OrgBranch 
                    node={sub} 
                    level={level + 1} 
                    expandedNodes={expandedNodes} 
                    toggleNode={toggleNode} 
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

// --- Vue Principale ---
export default function OrganigrammeView({ employes }: OrganigrammeViewProps) {
  const { hasPermission } = usePermissions();
  const canViewOrganigramme = hasPermission('rh', 'view');

  const [orgChart, setOrgChart] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchOrgChart = async () => {
    setLoading(true);
    try {
      // Simulation API ou appel réel
      const res = await fetch('/api/hr/organigramme', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrgChart(data);
        setLastUpdated(new Date());
        
        // Auto-expand first level on initial load only
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
    // Fonction récursive pour récupérer tous les IDs avec enfants
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

  // Filtrage (Recherche simple qui ne garde que les noeuds correspondants)
  // Note: Pour un organigramme, la recherche est complexe car si on filtre un parent, on perd les enfants.
  // Ici, nous faisons une mise en évidence visuelle plutôt qu'un filtrage destructif.

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
      {/* Header & Controls - Mobile Friendly */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm sticky top-2 z-30 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 rounded-xl">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">Structure</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              MAJ: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Barre de recherche compacte */}
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

          {/* Actions Rapides */}
          <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
            <button 
              onClick={handleExpandAll} 
              className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition tooltip" 
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

          <button 
            onClick={fetchOrgChart}
            disabled={loading}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>
        
        {/* Mobile Search (visible only on small screens) */}
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

      {/* Zone Organigramme */}
      <div className="min-h-[400px]">
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
    </div>
  );
}