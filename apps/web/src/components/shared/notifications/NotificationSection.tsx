import React from 'react';
import { LucideIcon } from 'lucide-react';
import Card from '../../ui/Card';

interface NotificationSectionProps {
  title: string;
  icon: LucideIcon;
  iconColorClass?: string;
  children: React.ReactNode;
}

export default function NotificationSection({ 
  title, 
  icon: Icon, 
  iconColorClass = "text-status-info", 
  children 
}: NotificationSectionProps) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-content-primary mb-6 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-surface ${iconColorClass.replace('text-', 'bg-').replace('600', '500/10')} border border-edge`}>
           <Icon className={iconColorClass} size={20} />
        </div>
        {title}
      </h2>
      <div className="space-y-6">
        {children}
      </div>
    </Card>
  );
}
