import React, { useState } from 'react';
import { User, CreditCard, Clock, X, Printer } from 'lucide-react';
import { Modal } from '../ui';
import ClientDetails from './ClientDetails';
import ClientAccounts from './ClientAccounts';
import ClientHistory from './ClientHistory';
import { Client } from '@shared/schema';

interface ClientViewProps {
  client: Client;
  onClose: () => void;
}

export default function ClientView({ client, onClose }: ClientViewProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'accounts' | 'history'>('details');

  const tabs = [
    { id: 'details', label: "Vue d'ensemble", icon: User },
    { id: 'accounts', label: 'Comptes Bancaires', icon: CreditCard },
    { id: 'history', label: 'Historique & Activité', icon: Clock },
  ] as const;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white">Dossier Client</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-700 text-xs text-slate-300 font-mono">
                {client.nom} {client.prenom}
            </span>
        </div>
      }
      size="2xl" // Increased size
    >
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700/50 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-700 text-cyan-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {activeTab === 'details' && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                <ClientDetails client={client} />
            </div>
          )}
          
          {activeTab === 'accounts' && (
             <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <ClientAccounts clientId={client.id} />
             </div>
          )}

          {activeTab === 'history' && (
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <ClientHistory clientId={client.id} />
             </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
