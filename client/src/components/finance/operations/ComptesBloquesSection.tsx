import React, { useState, useEffect, useMemo } from 'react';
import { StatutCompte } from '@shared/enum/status-constants';
import { Lock, Plus, Eye, TrendingUp, Calendar, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import CompteBloqueForm from './CompteBloqueForm';
import AccountDetailSlideOver from '../epargne/AccountDetailSlideOver';
import StatCard from '../../ui/StatCard';
import ResponsiveTable from '../../ui/ResponsiveTable';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';
import { formatClientName } from '../../../lib/format';

interface CompteBloque {
  id: string;
  numeroCompte: string;
  montantInitial: number;
  montantActuel: number;
  tauxInteret: number;
  dateOuverture: string;
  dateEcheance: string;
  dureeMois: number;
  statut: string;
  clients: {
    nom: string;
    prenom?: string;
    phone: string;
  } | null;
}

const ITEMS_PER_PAGE = 10;

export default function ComptesBloquesSection() {
  const [comptes, setComptes] = useState<CompteBloque[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCompteId, setSelectedCompteId] = useState<string | null>(null);
  
  // Pagination & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  // Filter comptes based on search
  const filteredComptes = useMemo(() => {
    if (!debouncedSearch) return comptes;
    const searchLower = debouncedSearch.toLowerCase();
    return comptes.filter(c => {
      const clientName = c.clients ? `${c.clients.nom || ''} ${c.clients.prenom || ''}`.toLowerCase() : '';
      const numero = (c.numeroCompte || '').toLowerCase();
      return clientName.includes(searchLower) || numero.includes(searchLower);
    });
  }, [comptes, debouncedSearch]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredComptes.length / ITEMS_PER_PAGE));
  const paginatedComptes = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredComptes.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredComptes, currentPage]);

  const getJoursRestants = (dateEcheance: string) => {
    if (!dateEcheance) return 0;
    const diff = new Date(dateEcheance).getTime() - new Date().getTime();
    const jours = Math.ceil(diff / (1000 * 3600 * 24));
    return jours > 0 ? jours : 0;
  };

  const calculateInterets = (compte: CompteBloque) => {
    return Math.round(compte.montantInitial * (compte.tauxInteret / 100) * (compte.dureeMois / 12));
  };

  const activeComptes = (comptes || []).filter(c => c && c.statut === StatutCompte.ACTIVE);
  
  const stats = {
    total: (comptes || []).length,
    actifs: activeComptes.length,
    montantTotal: activeComptes.reduce((sum, c) => sum + (c.montantActuel || 0), 0),
    interetsEstimes: activeComptes.reduce((sum, c) => sum + calculateInterets(c), 0)
  };

  const columns = [
    {
      label: 'Compte',
      key: 'numeroCompte',
      primary: true,
      format: (value: any, row: CompteBloque) => (
        <div>
          <div className="font-mono font-bold text-status-success">{value}</div>
          <div className="text-xs text-content-muted">
            {row.clients ? formatClientName(row.clients.nom, row.clients.prenom) : 'N/A'}
          </div>
        </div>
      )
    },
    {
      label: 'Montant',
      key: 'montantInitial',
      format: (value: any) => (
        <span className="font-bold text-content-primary">{Number(value).toLocaleString()} FCFA</span>
      )
    },
    {
      label: 'Termes',
      key: 'tauxInteret',
      format: (value: any, row: CompteBloque) => (
        <div className="flex flex-col text-xs">
          <span className="text-status-success font-semibold">{value}% / an</span>
          <span className="text-content-muted">{row.dureeMois} mois</span>
        </div>
      )
    },
    {
      label: 'Échéance',
      key: 'dateEcheance',
      format: (value: any, row: CompteBloque) => {
        const jours = getJoursRestants(value);
        return (
          <div className="flex flex-col">
            <span className="text-content-primary text-xs">
              {value ? new Date(value).toLocaleDateString() : 'N/A'}
            </span>
            {row.statut === StatutCompte.ACTIVE && jours > 0 && (
              <span className="text-[10px] text-status-warning">{jours}j restants</span>
            )}
          </div>
        );
      }
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (value: any, row: CompteBloque) => {
        const joursRestants = getJoursRestants(row.dateEcheance);
        const estEchu = joursRestants === 0 && row.statut === StatutCompte.ACTIVE;
        
        if (estEchu) return <Badge value="Échu" variant="success" />;
        
        const color = value === StatutCompte.ACTIVE ? 'success' : value === StatutCompte.CLOSED ? 'warning' : 'neutral';
        return <Badge value={value} variant={color} />;
      }
    }
  ];

  const actions = (row: CompteBloque) => (
    <IconButton
      icon={Eye}
      variant="ghost" 
      size="sm"
      className="text-content-muted hover:text-content-primary"
      aria-label="Voir détails"
      onClick={(e) => { e.stopPropagation(); setSelectedCompteId(row.id); }}
    />
  );

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      {/* Stats - Compact Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden group">
           <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Lock size={40} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Total Comptes</p>
            <h3 className="text-xl font-bold text-content-primary mt-0.5">{stats.total}</h3>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
             <div className="h-1.5 w-1.5 rounded-full bg-status-info"></div>
             <p className="text-[10px] text-status-info font-medium">{stats.actifs} actifs</p>
          </div>
        </div>

        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 p-3 opacity-5 text-status-success">
               <Lock size={40} />
             </div>
             <div>
                <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Montant Bloqué</p>
                <h3 className="text-xl font-bold text-status-success mt-0.5">{stats.montantTotal.toLocaleString()} <span className="text-xs font-normal text-content-muted">FCFA</span></h3>
             </div>
             <div className="mt-2 text-[10px] text-status-success font-medium bg-status-success-bg px-2 py-0.5 rounded-full w-fit">
               Capital Actuel
             </div>
        </div>

        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 p-3 opacity-5 text-status-warning">
               <TrendingUp size={40} />
             </div>
             <div>
                <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Intérêts Estimés</p>
                <h3 className="text-xl font-bold text-status-warning mt-0.5">{stats.interetsEstimes.toLocaleString()} <span className="text-xs font-normal text-content-muted">FCFA</span></h3>
             </div>
             <div className="mt-2 text-[10px] text-status-warning font-medium bg-status-warning-bg px-2 py-0.5 rounded-full w-fit">
               À terme
             </div>
        </div>
        
        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 p-3 opacity-5 text-accent">
               <Calendar size={40} />
             </div>
             <div>
                <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Valeur Future</p>
                <h3 className="text-xl font-bold text-accent mt-0.5">{(stats.montantTotal + stats.interetsEstimes).toLocaleString()} <span className="text-xs font-normal text-content-muted">FCFA</span></h3>
             </div>
             <div className="mt-2 text-[10px] text-accent font-medium bg-accent/10 px-2 py-0.5 rounded-full w-fit">
               Capital + Intérêts
             </div>
        </div>
      </div>

      {/* Toolbar & Table Container */}
      <div className="bg-surface-base rounded-lg border border-edge shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-2 gap-2 border-b border-edge bg-surface-muted/50">
           <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:ring-2 focus:ring-status-info/20 focus:border-status-info pl-8 pr-3 py-1.5 text-xs transition-all"
              />
           </div>
           
           <Button
             variant="primary"
             icon={Plus}
             onClick={() => setShowForm(true)}
             className="w-full sm:w-auto h-8 text-xs px-3 shadow-none bg-status-success hover:bg-status-success"
           >
             Nouveau Placement
           </Button>
        </div>

        <ResponsiveTable
          data={paginatedComptes}
          columns={columns}
          actions={actions}
          loading={loading}
          density="compact"
          emptyMessage={debouncedSearch ? `Aucun résultat pour "${debouncedSearch}"` : "Aucun compte bloqué"}
          onRowClick={(row) => setSelectedCompteId(row.id)}
        />
      </div>

      {/* Professional Pagination */}
      {filteredComptes.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3 bg-surface/30 rounded-lg border border-edge-subtle">
          {/* Info */}
          <div className="text-sm text-content-muted order-2 sm:order-1">
            Affichage {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredComptes.length)} sur {filteredComptes.length} comptes
          </div>
          
          {/* Pagination Controls */}
          <div className="flex items-center gap-1 order-1 sm:order-2">
            {/* First Page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed text-content-muted hover:text-content-primary transition"
              title="Première page"
            >
              <ChevronsLeft size={18} />
            </button>
            
            {/* Previous Page */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed text-content-muted hover:text-content-primary transition"
              title="Page précédente"
            >
              <ChevronLeft size={18} />
            </button>
            
            {/* Page Numbers */}
            <div className="flex items-center gap-1 px-2">
              {getPageNumbers().map((page, idx) => (
                page === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-content-muted">...</span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page as number)}
                    className={`w-8 h-8 rounded text-sm font-medium transition ${
                      page === currentPage
                        ? 'bg-status-success text-white shadow-lg shadow-status-success/25'
                        : 'text-content-muted hover:bg-surface-elevated hover:text-content-primary'
                    }`}
                  >
                    {page}
                  </button>
                )
              ))}
            </div>
            
            {/* Next Page */}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed text-content-muted hover:text-content-primary transition"
              title="Page suivante"
            >
              <ChevronRight size={18} />
            </button>
            
            {/* Last Page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed text-content-muted hover:text-content-primary transition"
              title="Dernière page"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Items per page info when pagination is not needed */}
      {filteredComptes.length > 0 && filteredComptes.length <= ITEMS_PER_PAGE && (
        <div className="text-sm text-content-muted text-center py-2">
          {filteredComptes.length} compte{filteredComptes.length > 1 ? 's' : ''} affiché{filteredComptes.length > 1 ? 's' : ''}
        </div>
      )}

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
        <AccountDetailSlideOver
          compteId={selectedCompteId}
          isOpen={!!selectedCompteId}
          onClose={() => setSelectedCompteId(null)}
        />
      )}
    </div>
  );
}
