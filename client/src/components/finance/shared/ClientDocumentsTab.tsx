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
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <FileText size={16} />
            Total Documents
          </div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <TrendingUp size={16} />
            Documents Payés
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.paid}</div>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Download size={16} />
            Montant Total
          </div>
          <div className="text-2xl font-bold text-white">{formatMoney(stats.amount)}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par numéro ou montant..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Documents List */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} />
            Documents ({filteredFactures.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400">
            Chargement...
          </div>
        ) : filteredFactures.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            Aucun document trouvé
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredFactures.map((facture) => (
              <div
                key={facture.id}
                className="p-4 hover:bg-slate-700/30 transition cursor-pointer"
                onClick={() => handleView(facture.id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-emerald-400">{facture.numero}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        facture.statut === 'payee' ? 'bg-green-500/20 text-green-400' :
                        facture.statut === 'en_attente' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {facture.statut === 'payee' ? 'Payée' :
                         facture.statut === 'en_attente' ? 'En attente' : 'Annulée'}
                      </span>
                    </div>
                    <div className="text-white font-semibold">{formatMoney(parseFloat(facture.montantTotal))}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(facture.dateFacture).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(facture.id);
                      }}
                      className="p-2 hover:bg-slate-600 rounded-lg transition"
                      title="Télécharger"
                    >
                      <Download size={16} className="text-slate-400 hover:text-white" />
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
