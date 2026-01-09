import React, { useState } from 'react';
import { CreditCard, Settings, Wallet } from 'lucide-react';
import { Card, Button } from '../ui';
import AdminCreditPlansGestion from './AdminCreditPlansGestion';
import AdminCreditSettings from './AdminCreditSettings';

export default function AdminCreditsGestion() {
  const [activeTab, setActiveTab] = useState<'plans' | 'settings'>('plans');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-blue-500/20 rounded-xl">
            <CreditCard className="text-blue-400" size={22} />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-white">Administration Crédits</h2>
            <p className="text-xs sm:text-sm text-slate-400">Gérer les plans et produits de crédit</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6">
         <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'plans' 
            ? 'text-blue-400 border-blue-500' 
            : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          <Wallet size={16} />
          Plans de Crédit
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'settings' 
            ? 'text-blue-400 border-blue-500' 
            : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          <Settings size={16} />
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
