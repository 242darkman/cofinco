import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  LogIn,
  AlertCircle,
  Shield,
  ShieldAlert,
  Building2,
  CheckCircle,
  Eye,
  EyeOff,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion'; 
import { authService, type User as UserType } from '../../lib/auth';
import LoginBackground from './LoginBackground';
import ForgotPasswordModal from './ForgotPasswordModal';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Card from '../ui/Card';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSystemSettings } from '../../hooks/settings/useSystemSettings';

interface LoginPageProps {
  onLoginSuccess: (user: UserType) => void;
  sessionExpiredMessage?: string | null;
}

export default function LoginPage({ onLoginSuccess, sessionExpiredMessage }: LoginPageProps) {
  const { t } = useLanguage();
  const { settings: systemSettings } = useSystemSettings(); // Fetch system settings
  
  // Safe helper to get dynamic name
  const agenceName = systemSettings?.find(s => s.cle === 'agence_name')?.valeur || 'COFIN&CO-M';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [successUser, setSuccessUser] = useState<UserType | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSessionExpiredBanner, setShowSessionExpiredBanner] = useState(!!sessionExpiredMessage);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Masquer la bannière après 10 secondes
  useEffect(() => {
    if (showSessionExpiredBanner) {
      const timer = setTimeout(() => {
        setShowSessionExpiredBanner(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showSessionExpiredBanner]);

  useEffect(() => {
    if (loginSuccess && successUser) {
      const timer = setTimeout(() => {
        onLoginSuccess(successUser);
      }, 2000); // Reduced to 2s for better flow
      return () => clearTimeout(timer);
    }
  }, [loginSuccess, successUser, onLoginSuccess]);

  // Countdown pour le verrouillage — auto-clear quand il atteint 0
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          setError('');
          setRemainingAttempts(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds > 0]);

  const formatCountdown = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m} min ${s.toString().padStart(2, '0')} sec`;
    return `${s} sec`;
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRemainingAttempts(null);

    if (lockoutSeconds > 0) return; // Bloqué — ne pas soumettre

    if (!username || !password) {
      setError(t('remplirTousChamps') || 'Veuillez remplir tous les champs');
      triggerShake();
      return;
    }

    setLoading(true);
    const startTime = Date.now();

    try {
      const user = await authService.login(username, password, rememberMe);

      const elapsed = Date.now() - startTime;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));

      if (user) {
        setLoading(false);
        setLoginSuccess(true);
        setSuccessUser(user);
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));

      // Compte verrouillé (403 ou 401 avec locked:true après la 5e tentative)
      if (err?.data?.locked) {
        setLockoutSeconds(err.data.retryAfterSeconds || 900);
        setRemainingAttempts(0);
        setError('Compte verrouillé suite à trop de tentatives échouées.');
      } else if (err?.status === 401) {
        // Identifiants invalides — afficher les tentatives restantes
        const remaining = err.data?.remainingAttempts;
        setRemainingAttempts(remaining ?? null);
        setError(err.message || 'Identifiant ou mot de passe incorrect');
      } else if (err?.status === 403) {
        setError(err.message || 'Accès refusé');
      } else {
        setError(t('erreurConnexion') || 'Erreur de connexion. Veuillez réessayer.');
      }

      triggerShake();
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      {/* Background Component */}
      <LoginBackground />

      {/* Session Expired Banner */}
      <AnimatePresence>
        {showSessionExpiredBanner && sessionExpiredMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-0 right-0 z-50"
          >
            <div className="bg-amber-500/95 backdrop-blur-sm border-b border-amber-600/50 px-4 py-3 shadow-lg">
              <div className="max-w-md mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-900 flex-shrink-0" />
                  <p className="text-sm font-medium text-amber-900">
                    {sessionExpiredMessage}
                  </p>
                </div>
                <button
                  onClick={() => setShowSessionExpiredBanner(false)}
                  className="text-amber-900/70 hover:text-amber-900 transition-colors p-1"
                  aria-label="Fermer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layout wrapper (mobile-first) */}
      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col lg:flex-row">
        {/* Mobile Header (compact branding to reduce scrolling) */}
        <div className="lg:hidden px-4 pt-5 sm:px-6 sm:pt-7">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-blue-500/15 bg-slate-900/30 p-3 backdrop-blur-md"
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-2xl"
              style={{
                boxShadow:
                  '0 16px 32px -12px rgba(59, 130, 246, 0.35), 0 0 0 1px rgba(59, 130, 246, 0.1)'
              }}
            >
              <img
                src="/cofin-logo.png"
                alt="COFIN&CO-M"
                className="h-10 w-10 object-contain"
                style={{ filter: 'drop-shadow(0 6px 10px rgba(59, 130, 246, 0.25))' }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                {agenceName}
              </h1>
              <p className="truncate text-xs text-cyan-300/80 font-medium">
                Institution de Microfinance
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
              <Shield size={14} className="text-blue-400" />
              <span className="hidden xs:inline">SSL/TLS</span>
            </div>
          </motion.div>
        </div>

        {/* Left Panel - Branding (desktop/tablet only) */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5">
          <div className="relative flex w-full flex-col justify-center items-center px-10 py-10 xl:px-12">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-center max-w-md"
            >
              {/* Logo with 3D effect */}
              <div className="relative mb-9">
                <div
                  className="absolute inset-0 w-36 h-36 xl:w-40 xl:h-40 mx-auto bg-blue-600/20 rounded-3xl blur-xl"
                  style={{ transform: 'translate(14px, 14px)' }}
                />
                <div
                  className="absolute inset-0 w-36 h-36 xl:w-40 xl:h-40 mx-auto bg-blue-500/15 rounded-3xl"
                  style={{ transform: 'translate(7px, 7px)' }}
                />

                <div
                  className="relative w-36 h-36 xl:w-40 xl:h-40 mx-auto bg-white rounded-3xl shadow-2xl flex items-center justify-center"
                  style={{
                    boxShadow:
                      '0 25px 50px -12px rgba(59, 130, 246, 0.35), 0 0 0 1px rgba(59, 130, 246, 0.1)'
                  }}
                >
                  <img
                    src="/cofin-logo.png"
                    alt="COFIN&CO-M Logo"
                    className="w-32 h-32 xl:w-36 xl:h-36 object-contain"
                    data-testid="img-logo"
                  />
                </div>
              </div>

              <h1 className="text-5xl xl:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent mb-4 tracking-tight drop-shadow-[0_0_25px_rgba(34,211,238,0.6)]">
                {agenceName}
              </h1>
              <p className="text-lg xl:text-xl text-cyan-300/80 mb-10 font-medium drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                Institution de Microfinance
              </p>

              {/* Feature cards */}
              <motion.div 
                className="space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 1 }}
              >
                <div
                  className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-5 border border-blue-500/20 shadow-lg shadow-blue-500/10 transform hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-300"
                  style={{ boxShadow: '0 10px 40px -10px rgba(59, 130, 246, 0.3)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                      <Shield className="text-white" size={22} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-white font-semibold text-base">Sécurité Bancaire</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Protection selon les normes internationales
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-5 border border-blue-500/20 shadow-lg shadow-blue-500/10 transform hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-300"
                  style={{ boxShadow: '0 10px 40px -10px rgba(59, 130, 246, 0.3)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/30">
                      <Building2 className="text-white" size={22} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-white font-semibold text-base">Gestion Complète</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Crédits, épargnes, tontines et comptabilité
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            <div className="absolute bottom-6 text-center">
              <p className="text-slate-400 text-sm">&copy; {new Date().getFullYear()} {agenceName}. {t('tousDroitsReserves') || 'Tous droits réservés.'}</p>
              <p className="text-slate-500 text-xs mt-1 tracking-wide">
                Une solution{' '}
                <a href="https://bvcorp.dev" target="_blank" rel="noopener noreferrer"
                   className="font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent hover:from-cyan-300 hover:to-blue-300 transition-all">
                  BV CORP
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Form (mobile-first, optimized height) */}
        <div className="flex w-full flex-1 items-center justify-center px-4 pb-6 pt-5 sm:px-6 sm:pb-10 sm:pt-8 lg:w-1/2 lg:px-10 lg:py-10 xl:w-2/5">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full max-w-md"
          >
            {/* Card */}
            <Card
              className="bg-gradient-to-br from-slate-800/95 via-slate-800/90 to-slate-900/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-blue-500/20"
              padding="lg"
              style={{
                boxShadow:
                  '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px -10px rgba(59, 130, 246, 0.2)'
              }}
            >
              {/* Heading */}
              <div className="mb-5 sm:mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1.5">
                  Espace Connexion
                </h2>
                <p className="text-slate-400 text-sm sm:text-base">
                  Veuillez vous identifier pour accéder
                </p>
              </div>

              <AnimatePresence mode="wait">
                {loginSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="text-center py-6 sm:py-8"
                  >
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                      className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 sm:mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/40"
                    >
                      <CheckCircle className="text-white" size={36} />
                    </motion.div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-1.5">
                      Connexion Réussie !
                    </h3>
                    <p className="text-emerald-400 mb-3 sm:mb-4">
                      Ravi de vous revoir, {successUser?.prenom || successUser?.username}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span>Redirection vers le tableau de bord...</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <AnimatePresence>
                      {(error || lockoutSeconds > 0) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{
                            opacity: 1,
                            height: 'auto',
                            x: shake ? [0, -10, 10, -10, 10, 0] : 0
                          }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{
                            x: { type: 'tween', duration: 0.4 },
                            default: { duration: 0.3 }
                          }}
                          className={`group relative overflow-hidden rounded-xl p-4 mb-5 flex items-start gap-4 ${
                            lockoutSeconds > 0
                              ? 'bg-amber-500/10 border border-amber-500/40'
                              : 'bg-red-500/10 border border-red-500/40'
                          }`}
                          data-testid="status-error"
                        >
                          {lockoutSeconds > 0 ? (
                            <>
                              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/10">
                                <ShieldAlert className="text-amber-400 drop-shadow-md" size={20} />
                              </div>
                              <div className="relative flex-1 py-0.5">
                                <h4 className="text-amber-400 font-bold text-sm mb-1">Compte temporairement verrouillé</h4>
                                <p className="text-amber-300/90 text-sm leading-relaxed mb-2">
                                  Trop de tentatives échouées. Veuillez patienter avant de réessayer.
                                </p>
                                <div className="flex items-center gap-2 text-amber-300">
                                  <Clock size={14} className="animate-pulse" />
                                  <span className="text-sm font-mono font-semibold">{formatCountdown(lockoutSeconds)}</span>
                                </div>
                                <div className="mt-2 w-full bg-amber-900/30 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="h-full bg-amber-500/60 rounded-full transition-all duration-1000"
                                    style={{ width: `${Math.max(0, (lockoutSeconds / 900) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="absolute inset-0 bg-red-500/5 animate-pulse" />
                              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/10">
                                <AlertCircle className="text-red-400 drop-shadow-md" size={20} />
                              </div>
                              <div className="relative flex-1 py-0.5">
                                <h4 className="text-red-400 font-bold text-sm mb-0.5">Erreur de connexion</h4>
                                <p className="text-red-300/90 text-sm leading-relaxed" data-testid="text-error-message">
                                  {error}
                                </p>
                                {remainingAttempts !== null && remainingAttempts <= 2 && remainingAttempts > 0 && (
                                  <p className="text-amber-400 text-xs mt-1.5 font-medium">
                                    Attention : {remainingAttempts} tentative{remainingAttempts > 1 ? 's' : ''} restante{remainingAttempts > 1 ? 's' : ''} avant verrouillage
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
                      <FormField
                        label={t('identifiant') || 'Identifiant'}
                        name="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Saisissez votre identifiant"
                        icon={User}
                        autoFocus
                        autoComplete="username"
                        data-testid="input-username"
                      />

                      <FormField
                        label={t('motDePasse') || 'Mot de passe'}
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Saisissez votre mot de passe"
                        icon={Lock}
                        rightIcon={showPassword ? EyeOff : Eye}
                        onRightIconClick={() => setShowPassword(!showPassword)}
                        autoComplete="current-password"
                        data-testid="input-password"
                      />

                      {/* Remember Me Checkbox & Forgot Password */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={rememberMe}
                              onChange={(e) => setRememberMe(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-blue-500
                                       focus:ring-blue-500/50 focus:ring-offset-0 focus:ring-2
                                       transition-colors cursor-pointer"
                            />
                            <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                              {t('seSouvenirDeMoi') || 'Se souvenir de moi'}
                            </span>
                          </label>
                        </div>
                        <div className="text-right">
                          <button
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                          >
                            {t('motDePasseOublie') || 'Mot de passe oublié ?'}
                          </button>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        fullWidth
                        isLoading={loading}
                        disabled={lockoutSeconds > 0}
                        icon={!loading ? LogIn : undefined}
                        iconPosition="left"
                        data-testid="button-submit"
                        className="transition-all duration-300 active:scale-[0.98]"
                      >
                        {lockoutSeconds > 0
                          ? `Verrouillé (${formatCountdown(lockoutSeconds)})`
                          : loading
                            ? (t('connexionEnCours') || 'Connexion en cours...')
                            : (t('seConnecter') || 'Se connecter')}
                      </Button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer area inside card (compact on mobile) */}
              <AnimatePresence>
                {!loginSuccess && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-slate-700"
                  >
                    <div className="flex items-center justify-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Shield size={14} className="text-blue-400" />
                        <span className="hidden sm:inline">Connexion sécurisée SSL/TLS</span>
                        <span className="sm:hidden">SSL/TLS</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* Mobile page footer (outside the card, avoids pushing content too much) */}
            <div className="lg:hidden mt-4 text-center">
              <p className="text-slate-400/90 text-xs">
                © {new Date().getFullYear()} {agenceName}. {t('tousDroitsReserves') || 'Tous droits réservés.'}
              </p>
              <p className="text-slate-500 text-[11px] mt-1 tracking-wide">
                Une solution{' '}
                <a href="https://bvcorp.dev" target="_blank" rel="noopener noreferrer"
                   className="font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent hover:from-cyan-300 hover:to-blue-300 transition-all">
                  BV CORP
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </div>
  );
}
