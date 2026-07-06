import React from 'react';

export default function LoginBackground() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: `linear-gradient(to bottom right, var(--login-bg-from), var(--login-bg-via), var(--login-bg-to))` }}
    >
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(var(--login-grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--login-grid-color) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Animated glow orbs */}
      <div className="absolute top-8 left-6 sm:top-10 sm:left-10 w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-3xl animate-pulse"
           style={{ background: `linear-gradient(to bottom right, var(--login-glow-1), var(--login-accent-glow))` }} />
      <div className="absolute bottom-8 right-6 sm:bottom-10 sm:right-10 w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl"
           style={{ background: `linear-gradient(to bottom right, var(--login-glow-2), var(--login-glow-1))` }} />
      <div className="absolute top-1/2 left-1/3 w-56 h-56 sm:w-72 sm:h-72 rounded-full blur-2xl"
           style={{ background: `linear-gradient(to bottom right, var(--login-accent-glow), transparent)` }} />
      <div className="absolute top-1/3 right-1/3 w-36 h-36 sm:w-48 sm:h-48 rounded-full blur-2xl"
           style={{ background: `linear-gradient(to bottom right, var(--login-glow-2), var(--login-glow-1))` }} />

      {/* Floating geometric shapes */}
      <div className="hidden sm:block absolute top-[15%] right-[20%] w-40 h-40 border border-accent/20 rounded-3xl transform rotate-12 animate-[spin_30s_linear_infinite]" />
      <div className="hidden sm:block absolute bottom-[20%] left-[15%] w-32 h-32 border rounded-2xl transform -rotate-12"
           style={{ borderColor: 'var(--login-shape-color-2)' }} />
      <div className="hidden md:block absolute top-[60%] right-[10%] w-24 h-24 border rounded-xl transform rotate-45"
           style={{ borderColor: 'var(--login-shape-color-2)' }} />
      <div className="hidden md:block absolute top-[10%] left-[40%] w-20 h-20 border rounded-full"
           style={{ borderColor: 'var(--login-shape-color-1)' }} />

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
          className="text-accent"
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
          className="text-status-info"
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
          className="text-status-info"
        />
      </svg>

      {/* Connecting lines */}
      <div className="hidden sm:block absolute top-0 left-1/4 w-px h-full"
           style={{ background: `linear-gradient(to bottom, transparent, var(--login-line-color), transparent)` }} />
      <div className="hidden sm:block absolute top-0 right-1/3 w-px h-full"
           style={{ background: `linear-gradient(to bottom, transparent, var(--login-line-color), transparent)` }} />
      <div className="hidden md:block absolute top-1/3 left-0 w-full h-px"
           style={{ background: `linear-gradient(to right, transparent, var(--login-line-color), transparent)` }} />

      {/* Corner accents */}
      <div className="hidden sm:block absolute top-0 left-0 w-56 h-56 sm:w-64 sm:h-64 border-l border-t border-accent/10 rounded-br-[90px] sm:rounded-br-[100px]" />
      <div className="hidden sm:block absolute bottom-0 right-0 w-56 h-56 sm:w-64 sm:h-64 border-r border-b rounded-tl-[90px] sm:rounded-tl-[100px]"
           style={{ borderColor: 'var(--login-shape-color-2)' }} />

      {/* Small floating dots */}
      <div className="absolute top-[20%] left-[60%] w-2 h-2 rounded-full animate-pulse"
           style={{ backgroundColor: 'var(--login-dot-1)' }} />
      <div
        className="absolute top-[70%] left-[25%] w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--login-dot-2)', animationDelay: '0.5s' }}
      />
      <div
        className="absolute top-[40%] right-[20%] w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--login-dot-2)', animationDelay: '1s' }}
      />
      <div
        className="absolute bottom-[25%] right-[40%] w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--login-dot-1)', animationDelay: '1.5s' }}
      />
      <div
        className="absolute top-[55%] left-[10%] w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--login-dot-2)', animationDelay: '2s' }}
      />
    </div>
  );
}
