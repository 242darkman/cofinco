
import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, Wallet } from "lucide-react";
import { Card } from "@/components/ui";
import { TransfertCoffreModal } from "./TransfertCoffreModal";

interface CaisseQuickActionsProps {
  caisseId: string;
  agenceId: string;
}

export function CaisseQuickActions({ caisseId, agenceId }: CaisseQuickActionsProps) {
  const [openTransfert, setOpenTransfert] = useState(false);

  return (
    <>
      <div className="mb-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Coffre-Fort & Trésorerie</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card 
            className="cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
            padding="sm"
            onClick={() => setOpenTransfert(true)}
          >
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                <Wallet size={24} />
              </div>
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">Coffre-Fort</span>
            </div>
          </Card>

          <Card 
            className="cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
            padding="sm"
          >
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                <ArrowDownLeft size={24} />
              </div>
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">Dépôt Rapide</span>
            </div>
          </Card>

          <Card 
            className="cursor-pointer hover:border-red-500/50 hover:bg-red-500/5 transition-all group"
            padding="sm"
          >
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-400 group-hover:scale-110 transition-transform">
                <ArrowUpRight size={24} />
              </div>
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">Retrait Rapide</span>
            </div>
          </Card>

          <Card 
            className="cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
            padding="sm"
          >
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400 group-hover:scale-110 transition-transform">
                <Coins size={24} />
              </div>
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">Arrêté Caisse</span>
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
