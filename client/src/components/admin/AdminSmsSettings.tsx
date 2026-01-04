import React, { useState, useEffect } from 'react';
import { MessageSquare, Settings, RefreshCw, Smartphone, Phone, Send, Clock, AlertCircle } from 'lucide-react';
import { Button, Card, TabGroup, SelectField, LoadingSpinner, EmptyState, Pagination } from '../ui';
import SmsConfigModal from './sms/SmsConfigModal';

interface SmsNotification {
  id: string;
  phoneNumber: string;
  type: string;
  message: string;
  status: string;
  sentAt: string | null;
}

interface ProviderStatus {
  availableProviders: string[];
  configuredProviders: Array<{
    provider: string;
    isActive: boolean;
    isPrimary: boolean;
  }>;
}

const providerLabels: Record<string, string> = {
  twilio: 'Twilio',
  africas_talking: "Africa's Talking",
  bulksms: 'BulkSMS',
  easysendsms: 'EasySendSMS',
  airtel_money: 'Airtel Money Congo',
  mtn_momo: 'MTN Mobile Money Congo',
  manual: 'Manuel'
};

const providerFields: Record<string, Array<{ key: string; label: string; placeholder: string; type?: string }>> = {
  twilio: [
    { key: 'accountSid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'authToken', label: 'Auth Token', placeholder: 'Token', type: 'password' },
    { key: 'phoneNumber', label: 'Numéro', placeholder: '+1234567890' }
  ],
  africas_talking: [
    { key: 'apiKey', label: 'API Key', placeholder: 'Clé API', type: 'password' },
    { key: 'username', label: 'Username', placeholder: 'sandbox' },
    { key: 'senderId', label: 'Sender ID', placeholder: 'COFIN' }
  ],
  bulksms: [{ key: 'apiToken', label: 'Token', placeholder: 'Token', type: 'password' }],
  easysendsms: [{ key: 'apiKey', label: 'API Key', placeholder: 'Clé API', type: 'password' }],
  airtel_money: [{ key: 'clientId', label: 'Client ID', placeholder: 'ID' }, { key: 'clientSecret', label: 'Secret', type: 'password', placeholder: 'Secret' }],
  mtn_momo: [{ key: 'subscriptionKey', label: 'Sub Key', placeholder: 'Key' }]
};

export default function AdminSmsSettings() {
  const [activeTab, setActiveTab] = useState('status');
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [notifications, setNotifications] = useState<SmsNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch('/api/sms/status'),
        fetch('/api/sms/logs?limit=100')
      ]);
      if (statusRes.ok) setProviderStatus(await statusRes.json());
      if (logsRes.ok) setNotifications(await logsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleConfigSubmit = async (provider: string, config: Record<string, string>) => {
    const res = await fetch('/api/sms/configure-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        settings: config,
        isActive: true,
        isPrimary: true
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erreur configuration');
    }
    await loadData();
  };

  const filteredNotifications = (notifications || []).filter(n => statusFilter === 'all' || n.status === statusFilter);
  const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
  const paginatedNotifications = filteredNotifications.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [statusFilter]);

  const stats = {
    total: (notifications || []).length,
    sent: (notifications || []).filter(n => n.status === 'sent').length,
    pending: (notifications || []).filter(n => n.status === 'pending').length,
    failed: (notifications || []).filter(n => n.status === 'failed').length
  };

  return (
    <div className="space-y-4">
      {/* Header - Compact */}
      <Card className="bg-slate-900 border-slate-800 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-cyan-500/20 rounded-lg flex-shrink-0">
              <MessageSquare className="text-cyan-400" size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">Gestion SMS</h2>
              <p className="text-[10px] sm:text-xs text-slate-500 truncate">Configuration et historique</p>
            </div>
          </div>
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={loadData}
            size="sm"
            isLoading={loading}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      </Card>

      {/* Stats - Compact Grid */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-slate-900 border-slate-800 p-2 sm:p-3 text-center">
          <Send size={14} className="text-cyan-400 mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-white">{stats.total}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">Total</p>
        </Card>
        <Card className="bg-slate-900 border-slate-800 p-2 sm:p-3 text-center">
          <Send size={14} className="text-emerald-400 mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-emerald-400">{stats.sent}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">Envoyés</p>
        </Card>
        <Card className="bg-slate-900 border-slate-800 p-2 sm:p-3 text-center">
          <Clock size={14} className="text-amber-400 mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-amber-400">{stats.pending}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">Attente</p>
        </Card>
        <Card className="bg-slate-900 border-slate-800 p-2 sm:p-3 text-center">
          <AlertCircle size={14} className="text-red-400 mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-red-400">{stats.failed}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">Échecs</p>
        </Card>
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={[
          { key: 'status', label: 'Configuration', icon: Settings },
          { key: 'logs', label: 'Historique', icon: MessageSquare }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Configuration Tab */}
      {activeTab === 'status' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {providerStatus?.availableProviders.map(provider => {
            const isConfigured = providerStatus.configuredProviders.some(p => p.provider === provider && p.isActive);
            const isPrimary = providerStatus.configuredProviders.some(p => p.provider === provider && p.isPrimary);

            return (
              <Card 
                key={provider} 
                className={`bg-slate-900 border-slate-800 p-3 sm:p-4 cursor-pointer hover:border-cyan-500/50 transition-all ${isPrimary ? 'border-emerald-500 ring-1 ring-emerald-500/30' : ''}`}
                onClick={() => { setSelectedProvider(provider); setShowConfigModal(true); }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${isConfigured ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
                    <Smartphone size={14} className={isConfigured ? 'text-emerald-400' : 'text-slate-500'} />
                  </div>
                  {isPrimary && (
                    <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">Actif</span>
                  )}
                </div>
                <h3 className="font-semibold text-white text-xs sm:text-sm truncate">{providerLabels[provider] || provider}</h3>
                <p className="text-[9px] sm:text-[10px] text-slate-500">{isConfigured ? 'Configuré' : 'Non configuré'}</p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
          <div className="px-3 sm:px-4 py-2 border-b border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs sm:text-sm font-medium text-white">Historique</span>
              <span className="text-[10px] text-slate-500 ml-2">{filteredNotifications.length} SMS</span>
            </div>
            <SelectField
              label=""
              name="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'sent', label: 'Envoyés' },
                { value: 'failed', label: 'Échecs' }
              ]}
              className="w-24 sm:w-28"
            />
          </div>
          
          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={MessageSquare}
                title="Aucun SMS"
                description="Aucun message dans l'historique."
              />
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-800">
                {paginatedNotifications.map((notif) => (
                  <div key={notif.id} className="px-3 sm:px-4 py-2.5 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-white text-xs sm:text-sm">{notif.phoneNumber}</span>
                      <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full ${
                        notif.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                        notif.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {notif.status === 'sent' ? 'Envoyé' : notif.status === 'failed' ? 'Échec' : 'Attente'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px] sm:text-xs truncate mt-0.5">{notif.message}</p>
                    <p className="text-slate-500 text-[9px] mt-0.5">
                      {notif.sentAt ? new Date(notif.sentAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </p>
                  </div>
                ))}
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-3 sm:px-4 py-2 border-t border-slate-800">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    canGoNext={currentPage < totalPages}
                    canGoPrevious={currentPage > 1}
                    itemsPerPage={itemsPerPage}
                    totalItems={filteredNotifications.length}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <SmsConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        provider={selectedProvider || ''}
        providerLabel={selectedProvider ? (providerLabels[selectedProvider] || selectedProvider) : ''}
        fields={selectedProvider ? (providerFields[selectedProvider] || []) : []}
        onSubmit={handleConfigSubmit}
      />
    </div>
  );
}
