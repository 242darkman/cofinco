import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  FileText, 
  Download, 
  Filter, 
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { caisseAgentApi } from '@/lib/api-client';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import FormField from '@/components/ui/FormField';
import SelectField from '@/components/ui/SelectField';
import { useToast } from '../../hooks/use-toast';
import { UniversalPaymentSuccessModal } from '@/components/finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '@/components/ui/printable/ReceiptTemplate';
import { StatutOperationTerrain } from '@shared/enum/status-constants';

interface AgentHistoryProps {
  agentId?: string;
}

export default function AgentHistory({ agentId }: AgentHistoryProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  
  // Receipt State
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);

  useEffect(() => {
    loadOperations();
  }, [agentId, filterType, filterStatut]);

  const loadOperations = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterType !== 'all') filters.type = filterType;
      if (filterStatut !== 'all') filters.statut = filterStatut;
      
      const response = await caisseAgentApi.getAgentOperations(agentId || '', filters);
      const data = Array.isArray(response) ? response : response.operations || [];
      setOperations(data);
    } catch (error) {
      console.error('Failed to load agent history:', error);
      toast({
        title: t('erreur'),
        description: "Impossible de charger l'historique.",
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredOperations = operations.filter(op => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      op.reference?.toLowerCase().includes(searchLower) ||
      op.client?.nom?.toLowerCase().includes(searchLower) ||
      op.destinationCaisse?.nom?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case StatutOperationTerrain.SUBMITTED: return <Badge variant="warning" icon={<Clock size={12} />} value="En attente" />;
      case StatutOperationTerrain.APPROVED: return <Badge variant="primary" icon={<CheckCircle2 size={12} />} value="Validé" />;
      case StatutOperationTerrain.SETTLED: return <Badge variant="success" icon={<CheckCircle2 size={12} />} value="Apuré" />;
      case StatutOperationTerrain.REJECTED: return <Badge variant="danger" icon={<XCircle size={12} />} value="Rejeté" />;
      case StatutOperationTerrain.CANCELLED: return <Badge variant="danger" icon={<AlertCircle size={12} />} value="Annulé" />;
      default: return <Badge value={statut} />;
    }
  };

  const handleShowReceipt = (op: any) => {
    const isCollect = op.type === 'COLLECT_CASH';
    
    const data: ReceiptData = {
      title: isCollect ? 'Reçu de Collecte Terrain' : 'Bordereau de Remise Fonds',
      reference: op.reference,
      date: op.submittedAt,
      type: isCollect ? 'Collecte' : 'Remise',
      client: isCollect ? {
        nom: op.client?.nom || 'Client',
        prenom: op.client?.prenom || '',
        telephone: op.client?.telephone,
      } : {
        nom: `Caisse: ${op.destinationCaisse?.nom || 'Agence'}`,
        prenom: '',
      },
      agent: {
        nom: op.agent?.nom || 'Agent',
        prenom: op.agent?.prenom || '',
      },
      items: [{
        description: isCollect 
          ? `Collecte de fonds - ${op.metadata?.typePaiementClient || 'Espèces'}`
          : `Remise de fonds collectés sur le terrain`,
        montant: parseFloat(op.montant),
        quantite: 1,
        details: op.metadata?.observations || op.metadata?.notes,
      }],
      total: parseFloat(op.montant),
      modePaiement: 'Espèces',
      notes: op.statut === StatutOperationTerrain.SETTLED ? 'Fonds reçus et validés par l\'agence.' : 'En attente de validation physique.',
    };

    setReceiptData(data);
    setShowReceipt(true);
  };

  return (
    <div className="space-y-4">
      <Card padding="none" className="overflow-hidden border-edge bg-surface/30">
        <div className="p-4 border-b border-edge flex flex-col lg:flex-row gap-4 bg-surface/50">
          <div className="flex-1">
            <FormField 
              label="" 
              name="search" 
              icon={Search} 
              containerClassName="mb-0"
              placeholder="Référence, client, caisse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-surface-base/50 border-edge-strong focus:border-accent"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="w-40">
               <SelectField
                  label=""
                  name="filterType"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  options={[
                      { value: 'all', label: 'Tous les types' },
                      { value: 'COLLECT_CASH', label: 'Collectes' },
                      { value: 'SETTLEMENT_CASH', label: 'Remises (Apurements)' }
                  ]}
                  containerClassName="mb-0"
                  className="bg-surface-base/50 border-edge-strong text-xs"
               />
            </div>
            <div className="w-40">
               <SelectField
                  label=""
                  name="filterStatut"
                  value={filterStatut}
                  onChange={(e) => setFilterStatut(e.target.value)}
                  options={[
                      { value: 'all', label: 'Tous les statuts' },
                      { value: StatutOperationTerrain.SUBMITTED, label: 'En attente' },
                      { value: StatutOperationTerrain.APPROVED, label: 'Validé' },
                      { value: StatutOperationTerrain.SETTLED, label: 'Apuré' },
                      { value: StatutOperationTerrain.REJECTED, label: 'Rejeté' }
                  ]}
                  containerClassName="mb-0"
                  className="bg-surface-base/50 border-edge-strong text-xs"
               />
            </div>
            <button 
              onClick={loadOperations}
              disabled={loading}
              className="p-2 text-content-muted hover:text-content-primary rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <ResponsiveTable
          data={filteredOperations}
          loading={loading}
          emptyMessage="Aucun mouvement trouvé dans l'historique."
          columns={[
            { 
              key: 'submittedAt', 
              label: 'Date', 
              format: (val) => (
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-content-muted" />
                  <span className="text-xs">{new Date(val).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              )
            },
            { 
              key: 'type', 
              label: 'Action', 
              format: (val) => (
                <div className="flex items-center gap-2">
                  {val === 'COLLECT_CASH' ? (
                    <div className="w-6 h-6 rounded-full bg-status-success-bg flex items-center justify-center text-status-success">
                      <ArrowDownLeft size={14} />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                      <ArrowUpRight size={14} />
                    </div>
                  )}
                  <span className="text-xs font-medium">{val === 'COLLECT_CASH' ? 'Collecte' : 'Remise'}</span>
                </div>
              )
            },
            { 
              key: 'montant', 
              label: 'Montant', 
              align: 'right',
              format: (val, item) => (
                <span className={`font-bold ${item.type === 'COLLECT_CASH' ? 'text-status-success' : 'text-accent'}`}>
                  {Number(val).toLocaleString()} <span className="text-[10px] opacity-60">FCFA</span>
                </span>
              )
            },
            { 
              key: 'target', 
              label: 'Bénéficiaire/Caisse',
              format: (_, item) => (
                <div className="text-xs truncate max-w-[150px]">
                  {item.type === 'COLLECT_CASH' ? (
                    <span className="text-content-secondary">{item.client?.nom || 'Client'}</span>
                  ) : (
                    <span className="text-content-secondary">Caisse: {item.destinationCaisse?.nom || 'Agence'}</span>
                  )}
                </div>
              )
            },
            { 
              key: 'statut', 
              label: 'Statut', 
              format: (val) => getStatusBadge(val)
            }
          ]}
          actions={(item) => (
            <button 
              className="p-1.5 text-content-muted hover:text-accent transition-colors"
              title="Détails / Reçu"
              onClick={(e) => { e.stopPropagation(); handleShowReceipt(item); }}
            >
              <FileText size={16} />
            </button>
          )}
        />
      </Card>

      <UniversalPaymentSuccessModal 
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        data={receiptData}
      />
    </div>
  );
}
