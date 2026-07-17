/**
 * Indicateurs visuels de SmartDocumentUpload : anneau de progression
 * circulaire et icônes en filigrane de l'état vide.
 */

// Anneau de progression circulaire
export function CircularProgress({ progress, size = 48 }: { progress: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
    >
      {/* Anneau de fond */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-content-secondary"
      />
      {/* Anneau de progression */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="text-accent transition-all duration-300 ease-out"
      />
    </svg>
  );
}

// Icônes SVG en filigrane
export function WatermarkIcon({ icon, className = '' }: { icon: 'front' | 'back' | 'scan'; className?: string }) {
  if (icon === 'front') {
    return (
      <svg viewBox="0 0 64 40" className={className} fill="currentColor">
        <rect x="2" y="2" width="60" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="16" r="8" />
        <rect x="30" y="10" width="24" height="3" rx="1.5" />
        <rect x="30" y="17" width="18" height="3" rx="1.5" />
        <rect x="30" y="24" width="20" height="3" rx="1.5" />
      </svg>
    );
  }
  if (icon === 'back') {
    return (
      <svg viewBox="0 0 64 40" className={className} fill="currentColor">
        <rect x="2" y="2" width="60" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="2" y="8" width="60" height="8" />
        <rect x="8" y="22" width="30" height="3" rx="1.5" />
        <rect x="8" y="28" width="24" height="3" rx="1.5" />
        <rect x="44" y="20" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  // scan
  return (
    <svg viewBox="0 0 48 48" className={className} fill="currentColor">
      <path d="M4 12V8a4 4 0 014-4h4M36 4h4a4 4 0 014 4v4M44 36v4a4 4 0 01-4 4h-4M12 44H8a4 4 0 01-4-4v-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="12" y="12" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="2" className="animate-pulse" />
    </svg>
  );
}
