import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Users, TrendingUp, DollarSign, MapPin, ChevronRight, X, Loader2, CreditCard } from 'lucide-react';
import { Modal, Card, Badge, Button, IconButton } from '../ui';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

interface SearchResults {
  clients: Array<{ id: string; nom: string; email?: string; telephone?: string; status?: string; type: string }>;
  credits: Array<{ id: string; typeCredit?: string; montant?: string; statut?: string; clientNom?: string; type: string }>;
  tontines: Array<{ id: string; nom: string; statut?: string; montantCotisation?: string; type: string }>;
  agents: Array<{ id: string; nom: string; prenom?: string; zoneAffectation?: string; statut?: string; type: string }>;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string, itemId?: string, itemType?: string) => void;
}

export default function GlobalSearchModal({ isOpen, onClose, onNavigate }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  const hasResults = results && (
    results.clients.length > 0 || results.credits.length > 0 ||
    results.tontines.length > 0 || results.agents.length > 0
  );

  if (!isOpen) return null;

  const ResultItem = ({ icon: Icon, iconBg, label, sublabel, onClick }: { 
    icon: React.ElementType; iconBg: string; label: string; sublabel?: string; onClick: () => void 
  }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-xl text-sm text-content-secondary hover:text-content-primary transition-colors group">
      <div className={`p-1.5 rounded-lg ${iconBg}`}><Icon size={14} /></div>
      <div className="flex-1 text-left truncate min-w-0">
        <p className="font-medium truncate">{label}</p>
        {sublabel && <p className="text-[10px] text-content-muted truncate">{sublabel}</p>}
      </div>
      <ChevronRight size={14} className="opacity-0 group-hover:opacity-50 shrink-0" />
    </button>
  );

  const QuickAction = ({ icon: Icon, iconBg, label, onClick }: { 
    icon: React.ElementType; iconBg: string; label: string; onClick: () => void 
  }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-muted rounded-xl text-sm text-content-secondary hover:text-content-primary transition-colors group">
      <div className={`p-1.5 rounded-lg ${iconBg} group-hover:scale-105 transition-transform`}><Icon size={16} /></div>
      <span>{label}</span>
      <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  );

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-10 sm:pt-20 px-4"
      onClick={onClose}
    >
      <Card 
        variant="elevated"
        padding="none"
        className="w-full max-w-md bg-surface-elevated/95 backdrop-blur-xl ring-1 ring-white/5 animate-in fade-in slide-in-from-top-4 duration-200 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-3 border-b border-edge shrink-0">
          <div className="relative">
            {loading ? (
              <Loader2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary animate-spin" />
            ) : (
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher clients, crédits, tontines..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-12 py-2.5 bg-surface-base border border-edge rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-content-muted text-content-primary transition-all"
            />
            {query ? (
              <IconButton 
                icon={X} 
                size="sm" 
                variant="ghost" 
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                aria-label="Effacer"
              />
            ) : (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex px-1.5 py-0.5 text-[10px] bg-surface-muted text-content-muted rounded border border-edge font-mono">
                ESC
              </kbd>
            )}
          </div>
        </div>

        {/* Results or Quick Actions */}
        <div className="p-2 overflow-y-auto grow">
          {hasResults ? (
            <div className="space-y-3">
              {results!.clients.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider px-2 py-1.5 flex items-center gap-1">
                    <Users size={12} /> Clients ({results!.clients.length})
                  </p>
                  <div className="space-y-0.5">
                    {results!.clients.map((client) => (
                      <ResultItem 
                        key={client.id}
                        icon={Users}
                        iconBg="bg-blue-500/10 text-blue-400"
                        label={client.nom}
                        sublabel={client.telephone}
                        onClick={() => onNavigate('clients', client.id, 'client')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {results!.credits.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-2 py-1.5 flex items-center gap-1">
                    <CreditCard size={12} /> Crédits ({results!.credits.length})
                  </p>
                  <div className="space-y-0.5">
                    {results!.credits.map((credit) => (
                      <ResultItem 
                        key={credit.id}
                        icon={CreditCard}
                        iconBg="bg-emerald-500/10 text-emerald-400"
                        label={credit.clientNom || credit.typeCredit || 'Crédit'}
                        sublabel={`${credit.montant ? Number(credit.montant).toLocaleString() + ' FCFA' : ''} • ${ALL_STATUS_LABELS[credit.statut || ''] || credit.statut || ''}`}
                        onClick={() => onNavigate('credits', credit.id, 'credit')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {results!.tontines.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider px-2 py-1.5 flex items-center gap-1">
                    <DollarSign size={12} /> Tontines ({results!.tontines.length})
                  </p>
                  <div className="space-y-0.5">
                    {results!.tontines.map((tontine) => (
                      <ResultItem 
                        key={tontine.id}
                        icon={DollarSign}
                        iconBg="bg-amber-500/10 text-amber-400"
                        label={tontine.nom}
                        sublabel={ALL_STATUS_LABELS[tontine.statut || ''] || tontine.statut}
                        onClick={() => onNavigate('tontines', tontine.id, 'tontine')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {results!.agents.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider px-2 py-1.5 flex items-center gap-1">
                    <MapPin size={12} /> Agents ({results!.agents.length})
                  </p>
                  <div className="space-y-0.5">
                    {results!.agents.map((agent) => (
                      <ResultItem 
                        key={agent.id}
                        icon={MapPin}
                        iconBg="bg-cyan-500/10 text-cyan-400"
                        label={`${agent.nom} ${agent.prenom || ''}`}
                        sublabel={agent.zoneAffectation}
                        onClick={() => onNavigate('agentTerrain', agent.id, 'agent')}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : query.length >= 2 && !loading ? (
            <div className="text-center py-8 text-content-muted">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun résultat pour "{query}"</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider px-2 py-1.5">
                Accès rapide
              </p>
              <div className="space-y-0.5">
                <QuickAction icon={Users} iconBg="bg-blue-500/10 text-blue-400" label="Clients" onClick={() => onNavigate('clients')} />
                <QuickAction icon={TrendingUp} iconBg="bg-emerald-500/10 text-emerald-400" label="Crédits" onClick={() => onNavigate('credits')} />
                <QuickAction icon={DollarSign} iconBg="bg-amber-500/10 text-amber-400" label="Tontines" onClick={() => onNavigate('tontines')} />
                <QuickAction icon={MapPin} iconBg="bg-cyan-500/10 text-cyan-400" label="Agents Terrain" onClick={() => onNavigate('agentTerrain')} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-edge shrink-0 text-center">
          <p className="text-[10px] text-content-muted">
            Tapez au moins 2 caractères pour rechercher
          </p>
        </div>
      </Card>
    </div>
  );
}
