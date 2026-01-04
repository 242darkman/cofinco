import React, { useState, useEffect } from 'react';
import { Lock, Plus, Eye, TrendingUp, Calendar } from 'lucide-react';
import CompteBloqueForm from './CompteBloqueForm';
import CompteBloqueDetail from './CompteBloqueDetail';
import StatCard from '../../ui/StatCard';
import ResponsiveTable from '../../ui/ResponsiveTable';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';

interface CompteBloque {
  id: string;
  numero_compte: string;
  montant_initial: number;
  montant_actuel: number;
  taux_interet: number;
  date_ouverture: string;
  date_echeance: string;
  duree_mois: number;
  statut: string;
  clients: {
    nom: string;
    phone: string;
  };
}

export default function ComptesBloquesSection() {
  const [comptes, setComptes] = useState<CompteBloque[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCompteId, setSelectedCompteId] = useState<string | null>(null);

  useEffect(() => {
    loadComptes();
  }, []);

  const loadComptes = async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/comptes-bloques', {
        credentials: 'include'
      });

      if (!res.ok) {
        console.error('Erreur chargement comptes bloqués');
        setComptes([]);
      } else {
        const data = await res.json();
        setComptes(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Exception:', error);
      setComptes([]);
    } finally {
      setLoading(false);
    }
  };

  const getJoursRestants = (dateEcheance: string) => {
    const diff = new Date(dateEcheance).getTime() - new Date().getTime();
    const jours = Math.ceil(diff / (1000 * 3600 * 24));
    return jours > 0 ? jours : 0;
  };

  const calculateInterets = (compte: CompteBloque) => {
    return Math.round(compte.montant_initial * (compte.taux_interet / 100) * (compte.duree_mois / 12));
  };

  const activeComptes = (comptes || []).filter(c => c && c.statut === 'Actif');
  
  const stats = {
    total: (comptes || []).length,
    actifs: activeComptes.length,
    montantTotal: activeComptes.reduce((sum, c) => sum + (c.montant_actuel || 0), 0),
    interetsEstimes: activeComptes.reduce((sum, c) => sum + calculateInterets(c), 0)
  };

  const columns = [
    {
      label: 'Compte',
      key: 'numero_compte',
      primary: true,
      format: (value: any, row: CompteBloque) => (
        <div>
          <div className="font-mono font-bold text-emerald-400">{value}</div>
          <div className="text-xs text-slate-400">{row.clients?.nom}</div>
        </div>
      )
    },
    {
      label: 'Montant',
      key: 'montant_initial',
      format: (value: any) => (
        <span className="font-bold text-white">{Number(value).toLocaleString()} FCFA</span>
      )
    },
    {
      label: 'Termes',
      key: 'taux_interet',
      format: (value: any, row: CompteBloque) => (
        <div className="flex flex-col text-xs">
          <span className="text-emerald-300 font-semibold">{value}% / an</span>
          <span className="text-slate-400">{row.duree_mois} mois</span>
        </div>
      )
    },
    {
      label: 'Échéance',
      key: 'date_echeance',
      format: (value: any, row: CompteBloque) => {
        const jours = getJoursRestants(value);
        return (
          <div className="flex flex-col">
            <span className="text-white text-xs">{new Date(value).toLocaleDateString()}</span>
            {row.statut === 'Actif' && jours > 0 && (
              <span className="text-[10px] text-amber-400">{jours}j restants</span>
            )}
          </div>
        );
      }
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (value: any, row: CompteBloque) => {
        const joursRestants = getJoursRestants(row.date_echeance);
        const estEchu = joursRestants === 0 && row.statut === 'Actif';
        
        if (estEchu) return <Badge value="Échu" variant="success" />;
        
        const color = value === 'Actif' ? 'success' : value === 'Retiré Anticipé' ? 'warning' : 'neutral';
        return <Badge value={value} variant={color} />;
      }
    }
  ];

  const actions = (row: CompteBloque) => (
    <IconButton
      icon={Eye}
      variant="ghost" 
      size="sm"
      className="text-slate-400 hover:text-white"
      aria-label="Voir détails"
      onClick={(e) => { e.stopPropagation(); setSelectedCompteId(row.id); }}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header Actions - No redundant Title */}
      <div className="flex justify-end pt-2">
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={() => setShowForm(true)}
          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/30 text-xs font-semibold uppercase tracking-wider h-8"
        >
          Nouveau Placement
        </Button>
      </div>

      {/* Stats Carousel - Tighter Padding */}
      <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:pb-0 no-scrollbar">
        <div className="flex md:grid md:grid-cols-4 gap-2 min-w-[max-content] md:min-w-0">
          <div className="w-[160px] md:w-auto">
            <StatCard 
              title="Total Comptes" 
              value={stats.total} 
              icon={Lock} 
              color="primary"
              subtitle={`${stats.actifs} actifs`}
            />
          </div>
          <div className="w-[180px] md:w-auto">
            <StatCard 
              title="Montant Bloqué" 
              value={stats.montantTotal.toLocaleString() + ' FCFA'} 
              icon={Lock} 
              color="success"
              subtitle="Montant actuel"
            />
          </div>
          <div className="w-[160px] md:w-auto">
            <StatCard 
              title="Intérêts Estimés" 
              value={stats.interetsEstimes.toLocaleString() + ' FCFA'} 
              icon={TrendingUp} 
              color="warning"
              subtitle="À terme"
            />
          </div>
          <div className="w-[180px] md:w-auto">
            <StatCard 
              title="Valeur Future" 
              value={(stats.montantTotal + stats.interetsEstimes).toLocaleString() + ' FCFA'} 
              icon={Calendar} 
              color="primary"
              subtitle="Capital + Intérêts"
            />
          </div>
        </div>
      </div>

      <ResponsiveTable
        data={comptes}
        columns={columns}
        actions={actions}
        loading={loading}
        emptyMessage="Aucun compte bloqué"
        onRowClick={(row) => setSelectedCompteId(row.id)}
      />

      {showForm && (
        <CompteBloqueForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadComptes();
          }}
        />
      )}

      {selectedCompteId && (
        <CompteBloqueDetail
          compteId={selectedCompteId}
          onClose={() => setSelectedCompteId(null)}
          onUpdate={() => {
            setSelectedCompteId(null);
            loadComptes();
          }}
        />
      )}
    </div>
  );
}
