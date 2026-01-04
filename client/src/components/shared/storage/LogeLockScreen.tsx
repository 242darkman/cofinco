import React from 'react';
import { Shield, Lock, Key, RefreshCw, AlertCircle } from 'lucide-react';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';

interface LogeLockScreenProps {
  password: string;
  setPassword: (password: string) => void;
  handleUnlock: () => void;
  authError: string;
  isAuthenticating: boolean;
}

export default function LogeLockScreen({ 
  password, setPassword, handleUnlock, authError, isAuthenticating 
}: LogeLockScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <div className="text-center mb-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
              <Shield className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Loge Cloud</h1>
            <p className="text-blue-200/80">Stockage sécurisé - 4 TB</p>
          </div>
          
          <div className="space-y-6">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-amber-100 font-medium text-sm">Accès protégé</p>
                <p className="text-amber-200/70 text-xs mt-1">
                  Ce stockage contient des données sensibles. Le mot de passe administrateur est requis.
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <FormField
                label="Mot de passe"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="Mot de passe administrateur"
                icon={Key}
                autoFocus
                className="bg-white/10 border-white/20 text-white placeholder-blue-200/50 focus:border-blue-400 focus:ring-blue-400"
                containerClassName='text-left'
              />
              
              {authError && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <p className="text-red-200 text-sm">{authError}</p>
                </div>
              )}
              
              <Button
                onClick={handleUnlock}
                disabled={isAuthenticating}
                fullWidth
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90 border-none"
                isLoading={isAuthenticating}
                icon={!isAuthenticating ? Lock : undefined}
              >
                {isAuthenticating ? 'Vérification...' : 'Déverrouiller la Loge'}
              </Button>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-blue-200/50 text-xs">
              COFIN - Plateforme Microfinance Sécurisée
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
