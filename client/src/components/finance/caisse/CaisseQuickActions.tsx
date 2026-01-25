
import React, { useState } from "react";
import { Wallet, ArrowRightLeft, CreditCard } from "lucide-react";
import { Card } from "@/components/ui";
import { TransfertCoffreModal } from "./TransfertCoffreModal";

interface CaisseQuickActionsProps {
  caisseId: string;
  agenceId: string;
  onNouvelleOperation?: () => void;
}

export function CaisseQuickActions({ caisseId, agenceId, onNouvelleOperation }: CaisseQuickActionsProps) {
  const [openTransfert, setOpenTransfert] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
           {/* Nouvelle Opération - Point d'entrée principal pour encaissement/décaissement */}
           <div 
             onClick={onNouvelleOperation}
             className="flex-1 flex items-center gap-3 p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer transition-colors group"
           >
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:scale-105 transition-transform">
                <CreditCard size={20} />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">Nouvelle Opération</span>
                <span className="text-[10px] text-cyan-400/70 font-medium">Encaissement • Décaissement</span>
              </div>
           </div>

           {/* Coffre-Fort - Transferts de trésorerie */}
           <div 
             onClick={() => setOpenTransfert(true)}
             className="flex-1 flex items-center gap-3 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer transition-colors group"
           >
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform">
                <ArrowRightLeft size={20} />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">Coffre-Fort</span>
                <span className="text-[10px] text-indigo-400/70 font-medium">Approvisionnement • Versement</span>
              </div>
           </div>
      </div>

      <TransfertCoffreModal
        open={openTransfert}
        onOpenChange={setOpenTransfert}
        caisseId={caisseId}
        agenceId={agenceId}
      />
    </>
  );
}
