import React from 'react';

export default function LoginBackground() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0f1d32] to-[#162544] overflow-hidden">
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Animated glow orbs */}
      <div className="absolute top-8 left-6 sm:top-10 sm:left-10 w-64 h-64 sm:w-80 sm:h-80 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-8 right-6 sm:bottom-10 sm:right-10 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-br from-purple-600/10 to-blue-600/8 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-56 h-56 sm:w-72 sm:h-72 bg-gradient-to-br from-cyan-400/12 to-transparent rounded-full blur-2xl" />
      <div className="absolute top-1/3 right-1/3 w-36 h-36 sm:w-48 sm:h-48 bg-gradient-to-br from-blue-400/8 to-purple-500/5 rounded-full blur-2xl" />

      {/* Floating geometric shapes (hide some on small screens to reduce clutter) */}
      <div className="hidden sm:block absolute top-[15%] right-[20%] w-40 h-40 border border-cyan-400/20 rounded-3xl transform rotate-12 animate-[spin_30s_linear_infinite]" />
      <div className="hidden sm:block absolute bottom-[20%] left-[15%] w-32 h-32 border border-blue-400/15 rounded-2xl transform -rotate-12" />
      <div className="hidden md:block absolute top-[60%] right-[10%] w-24 h-24 border border-purple-400/15 rounded-xl transform rotate-45" />
      <div className="hidden md:block absolute top-[10%] left-[40%] w-20 h-20 border border-cyan-300/10 rounded-full" />

      {/* Hexagon pattern elements */}
      <svg
        className="hidden md:block absolute top-[25%] left-[8%] w-32 h-32 opacity-10"
        viewBox="0 0 100 100"
      >
        <polygon
          points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-cyan-400"
        />
      </svg>
      <svg
        className="hidden md:block absolute bottom-[30%] right-[15%] w-24 h-24 opacity-10"
        viewBox="0 0 100 100"
      >
        <polygon
          points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-blue-400"
        />
      </svg>
      <svg
        className="hidden lg:block absolute top-[45%] right-[35%] w-16 h-16 opacity-8"
        viewBox="0 0 100 100"
      >
        <polygon
          points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-purple-400"
        />
      </svg>

      {/* Connecting lines */}
      <div className="hidden sm:block absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-blue-500/10 to-transparent" />
      <div className="hidden sm:block absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-cyan-500/8 to-transparent" />
      <div className="hidden md:block absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/8 to-transparent" />

      {/* Corner accents */}
      <div className="hidden sm:block absolute top-0 left-0 w-56 h-56 sm:w-64 sm:h-64 border-l border-t border-cyan-500/10 rounded-br-[90px] sm:rounded-br-[100px]" />
      <div className="hidden sm:block absolute bottom-0 right-0 w-56 h-56 sm:w-64 sm:h-64 border-r border-b border-blue-500/10 rounded-tl-[90px] sm:rounded-tl-[100px]" />

      {/* Small floating dots */}
      <div className="absolute top-[20%] left-[60%] w-2 h-2 bg-cyan-400/30 rounded-full animate-pulse" />
      <div
        className="absolute top-[70%] left-[25%] w-2 h-2 bg-blue-400/30 rounded-full animate-pulse"
        style={{ animationDelay: '0.5s' }}
      />
      <div
        className="absolute top-[40%] right-[20%] w-1.5 h-1.5 bg-purple-400/30 rounded-full animate-pulse"
        style={{ animationDelay: '1s' }}
      />
      <div
        className="absolute bottom-[25%] right-[40%] w-2 h-2 bg-cyan-300/25 rounded-full animate-pulse"
        style={{ animationDelay: '1.5s' }}
      />
      <div
        className="absolute top-[55%] left-[10%] w-1.5 h-1.5 bg-blue-300/25 rounded-full animate-pulse"
        style={{ animationDelay: '2s' }}
      />
    </div>
  );
}
