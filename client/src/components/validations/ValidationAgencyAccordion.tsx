import React from 'react';
import {
  Building2,
  MapPin,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  CheckCheck
} from 'lucide-react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { formatMoney } from '@/lib/format';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Agence } from '@/lib/api-client';
import type { OperationTerrainWithRelations } from '@shared/schema';

interface ValidationAgencyAccordionProps {
  agency: Agence;
  operations: OperationTerrainWithRelations[];
  totalAmount: number;
  onApproveOne: (op: OperationTerrainWithRelations) => void;
  onRejectOne: (id: string) => void;
  onApproveAll: (agencyId: string, opIds: string[]) => void;
  isProcessing?: boolean;
}

export default function ValidationAgencyAccordion({
  agency,
  operations,
  totalAmount,
  onApproveOne,
  onRejectOne,
  onApproveAll,
  isProcessing
}: ValidationAgencyAccordionProps) {
  const opIds = operations.map(op => op.id);

  return (
    <AccordionItem value={agency.id} className="border border-edge rounded-xl overflow-hidden mb-3 bg-surface shadow-sm hover:shadow-md transition-all duration-300">
      <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]>div>svg]:rotate-90">
        <div className="flex items-center gap-4 w-full text-left">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 size={20} className="text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-content-primary truncate">{agency.nom}</span>
              <Badge value={agency.code || 'AG'} variant="outline" className="text-[10px] py-0 h-4 border-edge-strong bg-surface-muted/30" />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-content-muted flex items-center gap-1">
                <AlertCircle size={12} className="text-status-warning" />
                {operations.length} demandes
              </span>
              <span className="text-xs text-content-muted flex items-center gap-1">
                <MapPin size={12} />
                {agency.ville || 'Locale'}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 mr-2 shrink-0">
            <span className="text-sm font-bold text-status-success">
              {formatMoney(totalAmount)}
            </span>
            <span className="text-[10px] text-content-muted uppercase tracking-wider font-semibold">Volume Total</span>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-0 pb-0 bg-surface-muted/10 border-t border-edge-subtle">
        <div className="divide-y divide-edge-subtle">
          {operations.map((op) => (
            <div key={op.id} className="p-4 flex items-center gap-4 hover:bg-surface-muted/30 transition-colors group">
              <div className="w-8 h-8 rounded-full bg-surface-elevated/50 flex items-center justify-center text-xs font-bold text-content-secondary group-hover:bg-primary/10 group-hover:text-primary transition-all">
                {op.client?.nom?.charAt(0) || 'C'}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-content-primary">
                    {op.client?.nom} {op.client?.prenom}
                  </span>
                  {(op as any).validationOTP === 'REQUIRED' && (
                    <Badge value="OTP" variant="warning" className="text-[9px] py-0 h-3.5" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-content-muted flex items-center gap-1">
                    <User size={10} /> {op.agent?.nom}
                  </span>
                  <span className="text-[11px] text-content-muted flex items-center gap-1 font-mono">
                    <Clock size={10} /> {format(new Date(op.createdAt), 'dd MMM HH:mm', { locale: fr })}
                  </span>
                </div>
              </div>

              <div className="text-right mr-2 shrink-0">
                <div className="text-sm font-bold text-content-primary">
                  {formatMoney(parseFloat(op.montant))}
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="xs" 
                  className="h-8 w-8 p-0 rounded-full hover:bg-status-danger/10 hover:text-status-danger"
                  onClick={() => onRejectOne(op.id)}
                >
                  <AlertCircle size={14} />
                </Button>
                <Button 
                  variant="success" 
                  size="xs" 
                  className="h-8 gap-1.5 px-3 rounded-full shadow-sm"
                  onClick={() => onApproveOne(op)}
                >
                  <CheckCircle size={14} />
                  Valider
                </Button>
              </div>
            </div>
          ))}

          <div className="p-3 bg-surface-muted/20 flex items-center justify-between">
            <span className="text-xs text-content-muted font-medium ml-2">
              {operations.length} opérations prêtes pour validation
            </span>
            <Button
              variant="primary"
              size="sm"
              className="h-9 gap-2 px-4 shadow-md bg-primary hover:shadow-primary/20"
              onClick={() => onApproveAll(agency.id, opIds)}
              disabled={isProcessing}
            >
              <CheckCheck size={16} />
              Tout valider pour cette agence
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
