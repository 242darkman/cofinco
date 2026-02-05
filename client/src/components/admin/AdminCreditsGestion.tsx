import React, { useState } from 'react';
import { CreditCard, Settings, Wallet } from 'lucide-react';
import { Card, Button } from '../ui';
import AdminCreditPlansGestion from './AdminCreditPlansGestion';
import AdminCreditSettings from './AdminCreditSettings';

export default function AdminCreditsGestion() {
  const [activeTab, setActiveTab] = useState<'plans' | 'settings'>('plans');

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 mx-[-8px] sm:mx-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <CreditCard className="text-blue-400" size={18} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">Administration Crédits</h2>
            <p className="text-[10px] sm:text-xs text-slate-400">Gérer les plans et produits de crédit</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-4 px-2">
         <button
          onClick={() => setActiveTab('plans')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'plans' 
            ? 'text-blue-400 border-blue-500' 
            : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          <Wallet size={14} />
          Plans de Crédit
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'settings' 
            ? 'text-blue-400 border-blue-500' 
            : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          <Settings size={14} />
          Paramètres Généraux
        </button>
      </div>

      {activeTab === 'plans' && (
        <AdminCreditPlansGestion />
      )}
      
      {activeTab === 'settings' && (
        <AdminCreditSettings />
      )}
    </div>
  );
}
