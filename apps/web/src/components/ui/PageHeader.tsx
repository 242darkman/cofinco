import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader Component - MicroFlex Platform
 * Standardized header for module pages with title, icon, description, and actions.
 */
export default function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className = ''
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 ${className}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-3 bg-gradient-to-br from-accent to-accent-secondary rounded-xl shadow-lg shadow-accent/20">
            <Icon className="w-8 h-8 text-white" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-content-primary tracking-tight">{title}</h1>
          {description && (
            <p className="text-content-muted mt-1">{description}</p>
          )}
        </div>
      </div>
      
      {actions && (
        <div className="flex flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
