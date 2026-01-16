export const ROLE_STYLES: Record<string, { label: string; classes: string }> = {
  'Administrateur': { 
    label: 'Administrateur', 
    classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
  },
  'admin': { 
    label: 'Administrateur', 
    classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
  },
  "Chef d'Agence": { 
    label: "Chef d'Agence", 
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
  },
  'Chef Agence': { 
    label: "Chef d'Agence", 
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
  },
  'chef_agence': { 
    label: "Chef d'Agence", 
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
  },
  'Comptable': { 
    label: 'Comptable', 
    classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
  },
  'comptable': { 
    label: 'Comptable', 
    classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
  },
  'Gestionnaire Crédit': { 
    label: 'Gestionnaire Crédit', 
    classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
  },
  'Superviseur': { 
    label: 'Superviseur', 
    classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
  },
  'superviseur': { 
    label: 'Superviseur', 
    classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
  },
  'Agent Caisse': { 
    label: 'Agent Caisse', 
    classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
  },
  'Caissier': { 
    label: 'Agent Caisse', 
    classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
  },
  'caissier': { 
    label: 'Agent Caisse', 
    classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
  },
  'Agent Terrain': { 
    label: 'Agent Terrain', 
    classes: 'bg-pink-500/10 text-pink-400 border-pink-500/20' 
  },
  'terrain': { 
    label: 'Agent Terrain', 
    classes: 'bg-pink-500/10 text-pink-400 border-pink-500/20' 
  },
  'Agent': { 
    label: 'Agent', 
    classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' 
  },
  'agent': { 
    label: 'Agent', 
    classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' 
  }
};

/**
 * Retourne le label professionnel et les classes CSS pour un badge de rôle
 */
export const getRoleBadgeStyle = (role: string) => {
  if (!role) {
    return { label: 'Inconnu', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  }
  
  return ROLE_STYLES[role] || { 
    label: role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' '), 
    classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20' 
  };
};
