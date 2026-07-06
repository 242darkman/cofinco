import React from 'react';
import { Shield } from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { formatMoney } from '@/lib/format';
import type { GarantieAdditionnelle } from '../types';

interface GuaranteesAccordionProps {
  garanties: GarantieAdditionnelle[];
}

export function GuaranteesAccordion({ garanties }: GuaranteesAccordionProps) {
  if (garanties.length === 0) return null;

  const totalValue = garanties.reduce((sum, g) => sum + Number(g.valeurEstimee || 0), 0);

  return (
    <div className="bg-surface rounded-xl border border-edge overflow-hidden">
      <Accordion type="single" collapsible defaultValue="guarantees">
        <AccordionItem value="guarantees" className="border-0">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-accent" />
              <span className="text-sm font-bold text-content-primary">Garanties supplémentaires</span>
              <span className="text-xs text-content-muted ml-1">({garanties.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-2">
              {garanties.map((g, i) => (
                <div key={i} className="flex items-center justify-between bg-surface-subtle/50 rounded-lg p-3 border border-edge-subtle">
                  <div>
                    <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Type</p>
                    <p className="text-sm text-content-primary font-medium">{g.type || 'Type non spécifié'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Valeur estimée</p>
                    <p className="text-sm font-mono text-accent font-bold">{formatMoney(Number(g.valeurEstimee || 0))}</p>
                  </div>
                </div>
              ))}
            </div>
            {garanties.length > 1 && (
              <div className="mt-3 pt-3 border-t border-edge flex justify-between text-sm">
                <span className="text-content-muted font-medium">Total estimé</span>
                <span className="font-bold font-mono text-accent">{formatMoney(totalValue)}</span>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
