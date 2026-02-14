import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { useReverseGeocode } from "../../hooks/useReverseGeocode";
import Button from "../ui/Button";

interface LocationDisplayProps {
  latitude?: number | string | null;
  longitude?: number | string | null;
  className?: string;
  showIcon?: boolean;
  minimal?: boolean; // If true, only shows text, no error/retry buttons
}

export function LocationDisplay({ 
  latitude, 
  longitude, 
  className = "",
  showIcon = true,
  minimal = false
}: LocationDisplayProps) {
  const { displayName, loading, error, refetch } = useReverseGeocode(latitude, longitude);

  if (!latitude || !longitude) {
    return <span className={`text-muted-foreground italic ${className}`}>Position non définie</span>;
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-muted-foreground ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="text-xs">Recherche de l'adresse...</span>
      </div>
    );
  }

  if (error) {
    if (minimal) return <span className="text-status-danger text-xs">Adresse introuvable</span>;
    
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1 text-status-danger text-xs cursor-help" title={error}>
          <AlertCircle className="w-3 h-3" />
          <span>Erreur</span>
        </div>
        <Button 
          variant="ghost" 
          size="xs" 
          className="text-content-primary h-auto p-0 hover:underline" 
          onClick={() => refetch()}
        >
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-1.5 ${className}`}>
       {showIcon && <MapPin className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />}
       <span className="break-words line-clamp-2 text-sm" title={displayName}>
         {displayName || `${latitude}, ${longitude}`}
       </span>
    </div>
  );
}
