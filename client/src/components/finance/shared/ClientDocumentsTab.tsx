import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, FileText, Search, Filter, Download, TrendingUp } from 'lucide-react';
import { factureApi, FactureFilters } from '@/lib/api/factureApi';
import { useReceiptActions } from '@/hooks/finance/useReceiptActions';
import { ReceiptViewer } from './ReceiptViewer';
import { formatMoney } from '@/lib/format';

interface ClientDocumentsTabProps {
  clientId: string;
}

export const ClientDocumentsTab: React.FC<ClientDocumentsTabProps> = ({ clientId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FactureFilters>({});

  // Receipt actions
  const {
    viewingFactureId,
    isViewerOpen,
    handleView,
    handleDownload,
    handleShare,
    handleCloseViewer
  } = useReceiptActions();

  // Fetch factures
  const { data: factures = [], isLoading } = useQuery({
    queryKey: ['client-factures', clientId, filters],
    queryFn: () => factureApi.getByClient(clientId, filters),
  });

  // Filter by search term
  const filteredFactures = useMemo(() => {
    if (!searchTerm) return factures;
    const term = searchTerm.toLowerCase();
    return factures.filter(f =>
      f.numero.toLowerCase().includes(term) ||
      f.montantTotal.toString().includes(term)
    );
  }, [factures, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: factures.length,
      paid: factures.filter(f => f.statut === 'payee').length,
      amount: factures.reduce((sum, f) => sum + parseFloat(f.montantTotal), 0),
    };
  }, [factures]);

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface/50 border border-edge rounded-lg p-4">
          <div className="flex items-center gap-2 text-content-muted text-sm mb-1">
            <FileText size={16} />
            Total Documents
          </div>
          <div className="text-2xl font-bold text-content-primary">{stats.total}</div>
        </div>
        
        <div className="bg-surface/50 border border-edge rounded-lg p-4">
          <div className="flex items-center gap-2 text-content-muted text-sm mb-1">
            <TrendingUp size={16} />
            Documents Payés
          </div>
          <div className="text-2xl font-bold text-status-success">{stats.paid}</div>
        </div>
        
        <div className="bg-surface/50 border border-edge rounded-lg p-4">
          <div className="flex items-center gap-2 text-content-muted text-sm mb-1">
            <Download size={16} />
            Montant Total
          </div>
          <div className="text-2xl font-bold text-content-primary">{formatMoney(stats.amount)}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" size={20} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par numéro ou montant..."
          className="w-full bg-surface border border-edge rounded-lg pl-10 pr-4 py-3 text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-status-success"
        />
      </div>

      {/* Documents List */}
      <div className="bg-surface/50 border border-edge rounded-lg">
        <div className="p-4 border-b border-edge">
          <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
            <FileText size={20} />
            Documents ({filteredFactures.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-content-muted">
            Chargement...
          </div>
        ) : filteredFactures.length === 0 ? (
          <div className="p-8 text-center text-content-muted">
            Aucun document trouvé
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {filteredFactures.map((facture) => (
              <div
                key={facture.id}
                className="p-4 hover:bg-surface-elevated/30 transition cursor-pointer"
                onClick={() => handleView(facture.id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-status-success">{facture.numero}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        facture.statut === 'payee' ? 'bg-status-success-bg text-status-success' :
                        facture.statut === 'en_attente' ? 'bg-status-warning-bg text-status-warning' :
                        'bg-status-danger-bg text-status-danger'
                      }`}>
                        {facture.statut === 'payee' ? 'Payée' :
                         facture.statut === 'en_attente' ? 'En attente' : 'Annulée'}
                      </span>
                    </div>
                    <div className="text-content-primary font-semibold">{formatMoney(parseFloat(facture.montantTotal))}</div>
                    <div className="text-xs text-content-muted">
                      {new Date(facture.dateFacture).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(facture.id);
                      }}
                      className="p-2 hover:bg-surface-subtle rounded-lg transition"
                      title="Télécharger"
                    >
                      <Download size={16} className="text-content-muted hover:text-content-primary" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receipt Viewer */}
      <ReceiptViewer
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
        factureId={viewingFactureId || ''}
        format="a4"
      />
    </div>
  );
};
