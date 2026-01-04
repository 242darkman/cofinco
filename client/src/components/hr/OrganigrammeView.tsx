
import React, { useEffect, useState } from 'react';
import { Users, Building2, ChevronDown, ChevronRight, User } from 'lucide-react';
import { Card } from '../ui';

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
  employes?: any[]; // Not used anymore, we fetch from API
}

export default function OrganigrammeView({ employes }: OrganigrammeViewProps) {
  const [orgChart, setOrgChart] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchOrgChart();
  }, []);

  const fetchOrgChart = async () => {
    try {
      const res = await fetch('/api/hr/organigramme');
      if (res.ok) {
        const data = await res.json();
        setOrgChart(data);
        // Auto-expand first level
        const firstLevelIds = data.map((n: OrgNode) => n.id);
        setExpandedNodes(new Set(firstLevelIds));
      }
    } catch (e) {
      console.error("Erreur chargement organigramme:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const renderNode = (node: OrgNode, level: number = 0) => {
    const hasSubordinates = node.subordinates && node.subordinates.length > 0;
    const isExpanded = expandedNodes.has(node.id);

    return (
      <div key={node.id} className="relative">
        <div 
          className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
            level === 0 ? 'bg-gradient-to-r from-blue-500/20 to-emerald-500/20 border border-blue-500/30' : 
            'bg-slate-700 hover:bg-slate-600'
          }`}
          style={{ marginLeft: `${level * 24}px` }}
        >
          {hasSubordinates && (
            <button 
              onClick={() => toggleNode(node.id)}
              className="p-1 hover:bg-slate-600 rounded transition"
            >
              {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
            </button>
          )}
          {!hasSubordinates && <div className="w-6" />}
          
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {node.photoProfile ? (
              <img src={node.photoProfile} alt={node.nom} className="w-full h-full rounded-full object-cover" />
            ) : (
              <>{node.nom.charAt(0)}{node.prenom.charAt(0)}</>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white text-sm truncate">
              {node.nom} {node.prenom}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {node.poste} • {node.departement}
            </div>
            {node.email && (
              <div className="text-xs text-blue-400 truncate mt-0.5">
                {node.email}
              </div>
            )}
          </div>
          
          {hasSubordinates && (
            <div className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
              {node.subordinates.length} {node.subordinates.length > 1 ? 'subordonnés' : 'subordonné'}
            </div>
          )}
        </div>

        {hasSubordinates && isExpanded && (
          <div className="mt-2 space-y-2">
            {node.subordinates.map(sub => renderNode(sub, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="text-slate-400">Chargement de l'organigramme...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-blue-400" />
        <h3 className="text-base sm:text-lg font-bold text-white">Organigramme Hiérarchique</h3>
      </div>

      <Card className="p-4 sm:p-6">
        {orgChart.length > 0 ? (
          <div className="space-y-3">
            {orgChart.map(node => renderNode(node))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>Aucun employé à afficher</p>
          </div>
        )}
      </Card>
    </div>
  );
}
