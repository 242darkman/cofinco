import React from 'react';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
  showLogo?: boolean;
}

function ModernSpinner({ size = 80 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer ring - slow rotation */}
      <div 
        className="absolute inset-0 rounded-full border-4 border-transparent"
        style={{
          borderTopColor: '#3b82f6',
          borderRightColor: '#3b82f6',
          animation: 'spin 2s linear infinite',
        }}
      />
      
      {/* Middle ring - medium speed, opposite direction */}
      <div 
        className="absolute rounded-full border-4 border-transparent"
        style={{
          inset: '8px',
          borderTopColor: '#06b6d4',
          borderLeftColor: '#06b6d4',
          animation: 'spin 1.5s linear infinite reverse',
        }}
      />
      
      {/* Inner ring - fast rotation */}
      <div 
        className="absolute rounded-full border-4 border-transparent"
        style={{
          inset: '16px',
          borderTopColor: '#10b981',
          borderRightColor: '#10b981',
          animation: 'spin 1s linear infinite',
        }}
      />
      
      {/* Center pulsing dot */}
      <div 
        className="absolute rounded-full bg-gradient-to-br from-blue-500 to-cyan-400"
        style={{
          inset: '28px',
          animation: 'pulse 1.5s ease-in-out infinite',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)',
        }}
      />
      
      {/* Glow effect */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
          animation: 'pulse 2s ease-in-out infinite',
        }}
      />
    </div>
  );
}

function SmallSpinner({ size = 48 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer arc */}
      <svg className="absolute inset-0" viewBox="0 0 50 50" style={{ animation: 'spin 1.5s linear infinite' }}>
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="url(#gradient1)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="80 40"
        />
        <defs>
          <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Inner arc - opposite direction */}
      <svg className="absolute inset-0" viewBox="0 0 50 50" style={{ animation: 'spin 1s linear infinite reverse' }}>
        <circle
          cx="25"
          cy="25"
          r="12"
          fill="none"
          stroke="url(#gradient2)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="50 30"
        />
        <defs>
          <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function LoadingScreen({ message = 'Chargement...', fullScreen = true, showLogo = false }: LoadingScreenProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 flex items-center justify-center z-50">
        <div className="text-center">
          {showLogo && (
            <div className="relative mb-8">
              {/* 3D shadow layers */}
              <div className="absolute inset-0 w-24 h-24 mx-auto bg-blue-600/20 rounded-2xl blur-xl" style={{ transform: 'translate(8px, 8px)' }} />
              <div className="absolute inset-0 w-24 h-24 mx-auto bg-blue-500/15 rounded-2xl" style={{ transform: 'translate(4px, 4px)' }} />
              
              {/* Main logo container with 3D effect */}
              <div className="relative w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center"
                   style={{ boxShadow: '0 20px 40px -10px rgba(59, 130, 246, 0.35), 0 0 0 1px rgba(59, 130, 246, 0.1)' }}>
                <img
                  src="/cofin-logo.png"
                  alt="COFIN&CO-M Logo"
                  className="w-20 h-20 object-contain"
                />
              </div>
            </div>
          )}
          
          {/* Cercle de chargement animé - centré */}
          <div className="relative mb-8 flex justify-center">
            <ModernSpinner size={80} />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{message}</h3>
          <p className="text-slate-400 mb-6">Veuillez patienter...</p>
          
          {/* Modern progress bar */}
          <div className="w-48 h-1.5 bg-slate-700 rounded-full mx-auto overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400"
              style={{
                width: '40%',
                animation: 'loading-bar 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
        
        <style>{`
          @keyframes loading-bar {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-12 min-h-[400px]">
      <div className="text-center">
        <div className="relative mb-4 flex justify-center">
          <SmallSpinner size={56} />
        </div>
        <p className="text-slate-300 dark:text-slate-400">{message}</p>
      </div>
    </div>
  );
}
