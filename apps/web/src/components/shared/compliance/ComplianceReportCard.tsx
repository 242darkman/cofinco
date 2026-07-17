import React from 'react';
import { Download, CheckCircle, LucideIcon } from 'lucide-react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';

interface ComplianceReportCardProps {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string; // expects utility class or similar, adjusted below to fit better
  items: string[];
  action: () => void;
  loading: boolean;
}

export default function ComplianceReportCard({
  title,
  description,
  icon: Icon,
  color,
  items,
  action,
  loading
}: ComplianceReportCardProps) {
  // Parsing color to use it as gradient or text color is tricky if passed as full class string
  // Assuming 'color' is a gradient string like "from-status-info to-accent" as in original file
  
  return (
    <Card className="flex flex-col h-full overflow-hidden border-0 shadow-lg group hover:transform hover:scale-[1.02] transition-transform duration-300">
      <div className={`bg-linear-to-r ${color} p-6 relative overflow-hidden`}>
         {/* Decorative background circle */}
         <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
         
        <Icon className="w-12 h-12 text-white mb-4 relative z-10" />
        <h3 className="text-xl font-bold text-white mb-2 relative z-10">{title}</h3>
        <p className="text-white/90 text-sm relative z-10 line-clamp-2">{description}</p>
      </div>

      <div className="p-6 flex flex-col flex-1 bg-surface">
        <ul className="space-y-3 mb-8 flex-1">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-3 text-content-secondary">
              <CheckCircle size={16} className="text-status-success mt-1 flex-shrink-0" />
              <span className="text-sm leading-snug">{item}</span>
            </li>
          ))}
        </ul>

        <Button
          onClick={action}
          isLoading={loading}
          disabled={loading}
          fullWidth
          icon={Download}
          className={`bg-linear-to-r ${color} border-0 hover:opacity-90 hover:scale-[1.01] transition-all shadow-md`}
        >
          {loading ? 'Génération...' : 'Générer le Rapport'}
        </Button>
      </div>
    </Card>
  );
}
