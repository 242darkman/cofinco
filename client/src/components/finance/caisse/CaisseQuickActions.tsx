
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
      <div className="mb-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Trésorerie</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Nouvelle Opération - Point d'entrée principal pour encaissement/décaissement */}
          <Card
            className="cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group"
            padding="sm"
            onClick={onNouvelleOperation}
          >
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-400 group-hover:scale-110 transition-transform shadow-lg shadow-cyan-500/10">
                <CreditCard size={28} />
              </div>
              <div className="text-center">
                <span className="text-sm font-semibold text-slate-200 group-hover:text-white block">Nouvelle Opération</span>
                <span className="text-[10px] text-slate-500 font-medium">Encaissement • Décaissement</span>
              </div>
            </div>
          </Card>

          {/* Coffre-Fort - Transferts de trésorerie */}
          <Card
            className="cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group"
            padding="sm"
            onClick={() => setOpenTransfert(true)}
          >
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 text-indigo-400 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/10">
                <ArrowRightLeft size={28} />
              </div>
              <div className="text-center">
                <span className="text-sm font-semibold text-slate-200 group-hover:text-white block">Coffre-Fort</span>
                <span className="text-[10px] text-slate-500 font-medium">Approvisionnement • Versement</span>
              </div>
            </div>
          </Card>
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
