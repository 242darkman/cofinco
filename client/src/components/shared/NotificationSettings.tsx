import React from 'react';
import { Bell, BellOff, Smartphone, CreditCard, Wallet, Users, Shield, Clock, Save, AlertTriangle } from 'lucide-react';
import { useNotificationSettings } from '../../hooks/useNotificationSettings';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Switch from '../ui/Switch';
import LoadingSpinner from '../ui/LoadingSpinner';
import NotificationSection from './notifications/NotificationSection';
import NotificationToggleRow from './notifications/NotificationToggleRow';
import SelectField from '../ui/SelectField';

export default function NotificationSettings() {
  const {
    preferences,
    loading,
    saving,
    message,
    isSubscribed,
    isSupported,
    pushLoading,
    permission,
    savePreferences,
    handleSubscribe,
    handleUnsubscribe,
    handleToggle,
    handleInputChange,
    t
  } = useNotificationSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text="Chargement des préférences..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0 animate-in fade-in duration-500">
      <div className="flex items-center justify-between p-1">
        <h1 className="text-2xl font-bold text-content-primary flex items-center gap-3">
          <div className="p-2 bg-status-info rounded-xl shadow-lg shadow-status-info/20">
             <Bell className="text-white" size={24} />
          </div>
          {t('notifications.settings') || 'Paramètres de notification'}
        </h1>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-status-success-bg border-status-success/20 text-status-success' : 'bg-status-danger-bg border-status-danger/20 text-status-danger'} animate-in slide-in-from-top-2`}>
          <div className="flex items-center gap-3">
             {message.type === 'success' ? <Bell size={20} /> : <AlertTriangle size={20} />}
             <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      {/* Push Notifications Section */}
      <Card className="p-6 border-edge bg-surface">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-status-info-bg rounded-xl">
               <Smartphone className="text-status-info" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-content-primary">
                {t('notifications.push_notifications') || 'Notifications Push'}
              </h2>
              <p className="text-sm text-content-muted">
                {isSupported 
                  ? (isSubscribed 
                    ? (t('notifications.enabled') || 'Activées sur cet appareil')
                    : (t('notifications.disabled') || 'Désactivées'))
                  : (t('notifications.not_supported') || 'Non supportées sur ce navigateur')
                }
              </p>
            </div>
          </div>
          {isSupported && (
            <Button
              onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
              isLoading={pushLoading}
              variant={isSubscribed ? 'danger' : 'primary'}
              icon={isSubscribed ? BellOff : Bell}
            >
              {isSubscribed 
                ? (t('notifications.disable') || 'Désactiver') 
                : (t('notifications.enable') || 'Activer')
              }
            </Button>
          )}
        </div>

        {permission === 'denied' && (
          <div className="mt-6 bg-status-warning-bg border border-status-warning/20 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-status-warning flex-shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-status-warning-text">
              {t('notifications.permission_denied') || 'Les notifications sont bloquées. Veuillez les autoriser dans les paramètres de votre navigateur.'}
            </p>
          </div>
        )}
      </Card>

      {/* Payment Reminders */}
      <NotificationSection title={t('notifications.payment_reminders') || 'Rappels de paiement'} icon={CreditCard} iconColorClass="text-status-info">
        <NotificationToggleRow
          label={t('notifications.payment_reminder_toggle') || 'Rappels de paiement'}
          description={t('notifications.payment_reminder_desc') || 'Recevoir des rappels avant les échéances'}
          checked={preferences.paymentReminders}
          onChange={() => handleToggle('paymentReminders')}
          testId="toggle-payment-reminders"
        />

        {preferences.paymentReminders && (
          <div className="ml-12 pl-4 border-l-2 border-edge animate-in slide-in-from-left-2">
            <div className="max-w-xs">
              <SelectField
                name="reminderDaysBefore"
                label="Délai de rappel"
                value={String(preferences.reminderDaysBefore)}
                onChange={(e) => handleInputChange('reminderDaysBefore', parseInt(e.target.value))}
                options={[
                  { value: '1', label: `1 ${t('common.day') || 'jour'} avant` },
                  { value: '3', label: `3 ${t('common.days') || 'ours'} avant` },
                  { value: '5', label: `5 ${t('common.days') || 'jours'} avant` },
                  { value: '7', label: `7 ${t('common.days') || 'jours'} avant` }
                ]}
              />
            </div>
          </div>
        )}

        <NotificationToggleRow
          label={t('notifications.overdue_alerts') || 'Alertes de retard'}
          description={t('notifications.overdue_alerts_desc') || 'Notifications pour les crédits en retard de paiement'}
          checked={preferences.overdueAlerts}
          onChange={() => handleToggle('overdueAlerts')}
          testId="toggle-overdue-alerts"
        />
      </NotificationSection>

      {/* Balance & Transactions */}
      <NotificationSection title={t('notifications.balance_alerts') || 'Soldes et Transactions'} icon={Wallet} iconColorClass="text-status-success">
        <NotificationToggleRow
          label={t('notifications.balance_alert_toggle') || 'Alertes solde bas'}
          description={t('notifications.balance_alert_desc') || 'Alerte quand le solde passe sous le seuil'}
          checked={preferences.balanceAlerts}
          onChange={() => handleToggle('balanceAlerts')}
          testId="toggle-balance-alerts"
        />

        {preferences.balanceAlerts && (
           <div className="ml-12 pl-4 border-l-2 border-edge mb-6 animate-in slide-in-from-left-2">
             <label className="block text-sm font-medium text-content-secondary mb-2">
               {t('notifications.threshold') || 'Seuil d\'alerte'} (FC)
             </label>
             <input
               type="number"
               value={preferences.lowBalanceThreshold}
               onChange={(e) => handleInputChange('lowBalanceThreshold', e.target.value)}
               className="px-4 py-2 bg-surface-base border border-edge-strong rounded-xl text-content-primary focus:ring-2 focus:ring-status-success w-full max-w-xs transition-all"
               placeholder="Ex: 10000"
             />
           </div>
        )}

        <NotificationToggleRow
          label={t('notifications.large_transactions') || 'Transactions importantes'}
          description={t('notifications.large_transactions_desc') || 'Alertes pour les mouvements de fonds importants'}
          checked={preferences.transactionAlerts}
          onChange={() => handleToggle('transactionAlerts')}
          testId="toggle-transaction-alerts"
        />

        {preferences.transactionAlerts && (
           <div className="ml-12 pl-4 border-l-2 border-edge animate-in slide-in-from-left-2">
             <label className="block text-sm font-medium text-content-secondary mb-2">
               {t('notifications.amount_threshold') || 'Montant déclencheur'} (FC)
             </label>
             <input
               type="number"
               value={preferences.largeTransactionThreshold}
               onChange={(e) => handleInputChange('largeTransactionThreshold', e.target.value)}
               className="px-4 py-2 bg-surface-base border border-edge-strong rounded-xl text-content-primary focus:ring-2 focus:ring-status-success w-full max-w-xs transition-all"
               placeholder="Ex: 100000"
             />
           </div>
        )}
      </NotificationSection>

      {/* Tontines */}
      <NotificationSection title={t('notifications.tontine_alerts') || 'Tontines'} icon={Users} iconColorClass="text-status-info">
        <NotificationToggleRow
          label={t('notifications.tontine_toggle') || 'Activité des tontines'}
          description={t('notifications.tontine_desc') || 'Nouveaux membres, tours de rôle...'}
          checked={preferences.tontineAlerts}
          onChange={() => handleToggle('tontineAlerts')}
          testId="toggle-tontine-alerts"
        />
        
        <NotificationToggleRow
          label={t('notifications.contribution_reminders') || 'Rappels de cotisation'}
          description={t('notifications.contribution_reminders_desc') || 'Ne manquez jamais un tour de cotisation'}
          checked={preferences.tontineContributionReminders}
          onChange={() => handleToggle('tontineContributionReminders')}
          testId="toggle-contribution-reminders"
        />
      </NotificationSection>

      {/* Security */}
      <NotificationSection title={t('notifications.security_alerts') || 'Sécurité'} icon={Shield} iconColorClass="text-status-danger">
        <NotificationToggleRow
          label={t('notifications.security_toggle') || 'Alertes de sécurité critiques'}
          description={t('notifications.security_desc') || 'Tentatives d\'intrusion, changements de mot de passe'}
          checked={preferences.securityAlerts}
          onChange={() => handleToggle('securityAlerts')}
          testId="toggle-security-alerts"
        />
        
        <NotificationToggleRow
          label={t('notifications.login_alerts') || 'Nouvelles connexions'}
          description={t('notifications.login_alerts_desc') || 'Recevoir une alerte à chaque connexion sur un nouvel appareil'}
          checked={preferences.loginAlerts}
          onChange={() => handleToggle('loginAlerts')}
          testId="toggle-login-alerts"
        />
      </NotificationSection>

      {/* Quiet Hours */}
      <NotificationSection title={t('notifications.quiet_hours') || 'Heures Silencieuses'} icon={Clock} iconColorClass="text-content-muted">
        <NotificationToggleRow
          label={t('notifications.quiet_hours_toggle') || 'Mode "Ne pas déranger"'}
          description={t('notifications.quiet_hours_desc') || 'Mettre en pause les notifications sur une plage horaire'}
          checked={preferences.quietHoursEnabled}
          onChange={() => handleToggle('quietHoursEnabled')}
          testId="toggle-quiet-hours"
        />

        {preferences.quietHoursEnabled && (
          <div className="ml-12 mt-4 grid grid-cols-2 gap-4 max-w-md animate-in slide-in-from-left-2">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-2">{t('common.from') || 'De'}</label>
              <input
                type="time"
                value={preferences.quietHoursStart}
                onChange={(e) => handleInputChange('quietHoursStart', e.target.value)}
                className="w-full px-4 py-2 bg-surface-base border border-edge-strong rounded-xl text-content-primary focus:ring-2 focus:ring-status-info"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-2">{t('common.to') || 'À'}</label>
              <input
                type="time"
                value={preferences.quietHoursEnd}
                onChange={(e) => handleInputChange('quietHoursEnd', e.target.value)}
                className="w-full px-4 py-2 bg-surface-base border border-edge-strong rounded-xl text-content-primary focus:ring-2 focus:ring-status-info"
              />
            </div>
          </div>
        )}
      </NotificationSection>

      <div className="flex justify-end pt-4">
        <Button
          onClick={savePreferences}
          isLoading={saving}
          variant="primary"
          size="lg"
          icon={Save}
          className="shadow-xl shadow-status-info/20"
        >
          {t('common.save') || 'Enregistrer les préférences'}
        </Button>
      </div>
    </div>
  );
}
