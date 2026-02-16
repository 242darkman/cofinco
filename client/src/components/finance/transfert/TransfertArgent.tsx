import { useState } from 'react';
import { Send, History } from 'lucide-react';
import { TabGroup } from '../../ui';
import TransactionFlow from './TransactionFlow';
import TransferHistory from './TransferHistory';

export default function TransfertArgent() {
  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');

  return (
    <div className="flex flex-col h-full relative" data-testid="module-transfert">
      <div className="shrink-0 px-2 sm:px-3 pt-1.5 pb-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-content-primary flex items-center gap-2">
              <Send className="text-status-success" size={20} />
              Virements
            </h1>
            <p className="text-content-muted text-[10px] mt-0.5">Transferts internes et vers bénéficiaires</p>
          </div>
          <TabGroup
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as 'send' | 'history')}
            tabs={[
              { key: 'send', label: 'Envoyer', icon: Send },
              { key: 'history', label: 'Historique', icon: History },
            ]}
            variant="pills"
            size="sm"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'send' && <TransactionFlow />}
        {activeTab === 'history' && <TransferHistory />}
      </div>
    </div>
  );
}
