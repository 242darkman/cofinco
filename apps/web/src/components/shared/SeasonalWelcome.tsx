import React, { useEffect, useState } from 'react';
import { TenantLogo } from '@/components/branding/TenantLogo';
import { Sparkles, PartyPopper, Snowflake, Gift, TreePine, Wine, Hand } from 'lucide-react';
import { useBranding } from '../../contexts/BrandingContext';

interface SeasonalWelcomeProps {
  userName?: string;
  onComplete: () => void;
}

type EventType = 'christmas' | 'newyear' | null;

export default function SeasonalWelcome({ userName = 'Utilisateur', onComplete }: Readonly<SeasonalWelcomeProps>) {
  const { branding } = useBranding();
  const [eventType, setEventType] = useState<EventType>(null);
  const [visible, setVisible] = useState(true);
  const [particles, setParticles] = useState<Array<{ id: number; left: number; delay: number; duration: number; color?: string }>>([]);

  useEffect(() => {
    const checkSeason = () => {
      const now = new Date();
      const month = now.getMonth(); // 0-11
      const day = now.getDate();

      // Debug: uncomment to force test specific dates
      // const month = 11; const day = 31; 

      if (month === 11 && (day >= 24 && day <= 26)) {
        return 'christmas';
      } else if ((month === 11 && day === 31) || (month === 0 && day <= 2)) {
        return 'newyear';
      }
      return null;
    };

    const type = checkSeason();
    if (!type) {
      onComplete();
      return;
    }
    setEventType(type);

    // Config animations based on type
    const count = 50;
    const getRandom = () => {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] / (0xffffffff + 1);
    };

    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: getRandom() * 100,
      delay: getRandom() * 5,
      duration: 3 + getRandom() * 4,
      color: type === 'newyear' ? ['#FFD700', '#FF0000', '#00FF00', '#0000FF', '#FF00FF'][Math.floor(getRandom() * 5)] : undefined
    }));
    setParticles(newParticles);

    // Auto close
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 500);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible || !eventType) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-surface-base/90 backdrop-blur-md animate-fadeIn overflow-hidden">
      {/* Background Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute ${eventType === 'christmas' ? 'text-content-primary text-2xl opacity-80' : 'w-2 h-2 rounded-full'} animate-fall`}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            backgroundColor: p.color,
            fontSize: eventType === 'christmas' ? undefined : '0'
          }}
        >
          {eventType === 'christmas' ? <Snowflake size={12} className="text-white" /> : ''}
        </div>
      ))}

      <div className="relative z-10 text-center animate-scaleIn px-4 w-full max-w-md mx-auto">
        {/* Logo Container */}
        <div className="relative mb-6 md:mb-8 mx-auto w-20 h-20 md:w-24 md:h-24">
          <div className={`absolute inset-0 rounded-2xl blur-xl ${eventType === 'christmas' ? 'bg-status-success-bg' : 'bg-status-info-bg'}`} />
          
          <div className="relative w-full h-full bg-white rounded-2xl flex items-center justify-center shadow-2xl">
            <TenantLogo className="w-12 h-12 md:w-16 md:h-16 object-contain" />
            <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 animate-bounce bg-white rounded-full p-1.5 md:p-2 shadow-lg">
              {eventType === 'christmas' ? <Gift className="w-5 h-5 md:w-6 md:h-6 text-status-danger" /> : <PartyPopper className="w-5 h-5 md:w-6 md:h-6 text-status-warning" />}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 md:space-y-4 animate-slideUp">
          <div className="flex items-center justify-center gap-2 mb-2">
            {eventType === 'christmas' ? (
              <>
                <TreePine className="text-status-success animate-bounce" size={32} />
                <Sparkles className="text-accent animate-pulse" size={28} />
                <Gift className="text-status-danger animate-bounce" size={32} style={{ animationDelay: '0.2s' }} />
              </>
            ) : (
              <>
                <Sparkles className="text-status-warning animate-bounce" size={32} />
                <PartyPopper className="text-status-warning animate-pulse" size={32} />
                <Wine className="text-status-warning animate-bounce" size={32} style={{ animationDelay: '0.2s' }} />
              </>
            )}
          </div>

          <h1 className={`text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-linear-to-r ${
            eventType === 'christmas' ? 'from-status-danger via-green-500 to-status-danger' : 'from-status-warning via-purple-500 to-pink-500'
          } animate-glow`}>
            {eventType === 'christmas' ? 'Joyeux Noël !' : 'Bonne Année !'}
          </h1>

          <h2 className="text-xl md:text-2xl font-bold text-content-primary">
            Bienvenue sur <span className="text-accent">{branding.appName}</span>
          </h2>

          <p className="text-lg md:text-2xl text-content-secondary">
            <span className="inline-flex items-center justify-center gap-2">
              Bonjour <span className={`${eventType === 'christmas' ? 'text-status-success' : 'text-status-info'} font-semibold`}>{userName}</span>
              <Hand className="w-5 h-5 md:w-6 md:h-6 text-status-warning origin-bottom-right animate-bounce" />
            </span>
          </p>

          <p className="text-sm md:text-base text-content-muted mt-4 max-w-xs mx-auto">
            {eventType === 'christmas' 
              ? "Toute l'équipe vous souhaite de joyeuses fêtes et une excellente fin d'année." 
              : "Que cette nouvelle année vous apporte succès, prospérité et réussite dans vos projets."}
          </p>
          
          <div className="pt-6">
             <button 
               onClick={() => setVisible(false)}
               className="text-content-muted text-sm hover:text-content-primary transition underline"
             >
               Passer l'animation
             </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 5px rgba(255,255,255,0.3)); }
          50% { filter: drop-shadow(0 0 15px rgba(255,255,255,0.6)); }
        }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-slideUp { animation: slideUp 0.8s ease-out 0.2s backwards; }
        .animate-fall { animation: fall linear infinite; }
        .animate-glow { animation: glow 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
