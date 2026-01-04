import React, { createContext, useContext, ReactNode } from 'react';

/**
 * Configuration des fonctionnalités disponibles dans l'application.
 * Permet de désactiver globalement certaines fonctionnalités non encore opérationnelles.
 */
interface FeatureFlags {
  // SMS
  smsEnabled: boolean;
  smsMessage: string;
  
  // Mobile Money / Transferts
  mobileMoneyEnabled: boolean;
  mobileMoneyMessage: string;
  
  // Transferts internationaux
  internationalTransferEnabled: boolean;
  internationalTransferMessage: string;
}

const defaultFeatures: FeatureFlags = {
  // Désactivé par défaut - pas encore connecté aux APIs
  smsEnabled: false,
  smsMessage: "Service SMS non disponible actuellement",
  
  mobileMoneyEnabled: false,
  mobileMoneyMessage: "Mobile Money non disponible actuellement",
  
  internationalTransferEnabled: false,
  internationalTransferMessage: "Transferts internationaux non disponibles actuellement",
};

const FeatureFlagsContext = createContext<FeatureFlags>(defaultFeatures);

export function FeatureFlagsProvider({ 
  children,
  overrides = {}
}: { 
  children: ReactNode;
  overrides?: Partial<FeatureFlags>;
}) {
  const features = { ...defaultFeatures, ...overrides };
  
  return (
    <FeatureFlagsContext.Provider value={features}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

/**
 * Hook pour vérifier si une fonctionnalité est activée
 * et obtenir le message à afficher si désactivée
 */
export function useFeature(feature: keyof Omit<FeatureFlags, 'smsMessage' | 'mobileMoneyMessage' | 'internationalTransferMessage'>) {
  const flags = useFeatureFlags();
  
  const messageKey = `${feature.replace('Enabled', '')}Message` as keyof FeatureFlags;
  
  return {
    enabled: flags[feature] as boolean,
    message: flags[messageKey] as string || 'Fonctionnalité non disponible',
  };
}

/**
 * Composant wrapper pour les boutons désactivables
 * Affiche automatiquement un tooltip et grise le bouton si la fonctionnalité est désactivée
 */
interface DisableableButtonProps {
  feature: 'sms' | 'mobileMoney' | 'internationalTransfer';
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export function DisableableButton({
  feature,
  children,
  className = '',
  onClick,
  type = 'button',
  disabled = false,
}: DisableableButtonProps) {
  const flags = useFeatureFlags();
  
  const featureKey = `${feature}Enabled` as keyof FeatureFlags;
  const messageKey = `${feature}Message` as keyof FeatureFlags;
  
  const isFeatureEnabled = flags[featureKey] as boolean;
  const message = flags[messageKey] as string;
  
  const isDisabled = disabled || !isFeatureEnabled;
  
  if (!isFeatureEnabled) {
    return (
      <div className="relative group">
        <button
          type={type}
          disabled
          className={`${className} opacity-50 cursor-not-allowed`}
          title={message}
        >
          {children}
        </button>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-amber-400 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-amber-500/30">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {message}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={className}
    >
      {children}
    </button>
  );
}

/**
 * Composant Badge pour indiquer qu'une fonctionnalité n'est pas disponible
 */
export function UnavailableBadge({ feature }: { feature: 'sms' | 'mobileMoney' | 'internationalTransfer' }) {
  const flags = useFeatureFlags();
  const featureKey = `${feature}Enabled` as keyof FeatureFlags;
  
  if (flags[featureKey]) return null;
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full border border-amber-500/30">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Bientôt disponible
    </span>
  );
}

export default FeatureFlagsContext;
