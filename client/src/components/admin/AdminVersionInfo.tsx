import React from 'react';
import { Package, Code, Calendar, Server, Database, Globe, Shield } from 'lucide-react';
import { Card, Badge } from '../ui';

// Import version from package.json at build time
const APP_VERSION = '1.0.0'; // Read from package.json at build
const BUILD_ENV = import.meta.env.MODE || 'development';

interface InfoRowProps {
  icon: React.ElementType;
  label: string;
  value: string;
  valueColor?: string;
}

function InfoRow({ icon: Icon, label, value, valueColor = 'text-white' }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
      <div className="flex items-center gap-2.5">
        <Icon size={16} className="text-slate-400" />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <span className={`text-sm font-medium ${valueColor}`}>{value}</span>
    </div>
  );
}

export default function AdminVersionInfo() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 sm:p-3 bg-blue-500/20 rounded-xl">
          <Package className="text-blue-400" size={22} />
        </div>
        <div>
          <h2 className="text-lg sm:text-2xl font-bold text-white">
            Version du Système
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Informations techniques de la plateforme
          </p>
        </div>
      </div>

      {/* Version Principal */}
      <Card className="bg-gradient-to-br from-blue-900/30 to-slate-900 border-blue-500/20 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Version actuelle</p>
            <div className="flex items-center gap-3">
              <span className="text-3xl sm:text-4xl font-bold text-white">v{APP_VERSION}</span>
              <Badge 
                value={BUILD_ENV === 'production' ? 'Production' : 'Développement'} 
                variant={BUILD_ENV === 'production' ? 'success' : 'warning'} 
                size="sm"
              />
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-slate-500 text-xs">COFIN & CO-M</p>
            <p className="text-slate-400 text-sm font-medium">Microfinance Platform</p>
          </div>
        </div>
      </Card>

      {/* Informations Système */}
      <Card className="bg-slate-900 border-slate-800 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Server size={16} className="text-slate-400" />
          Informations Système
        </h3>
        <div className="space-y-2">
          <InfoRow icon={Code} label="Version" value={`v${APP_VERSION}`} valueColor="text-blue-400" />
          <InfoRow icon={Globe} label="Environnement" value={BUILD_ENV === 'production' ? 'Production' : 'Développement'} valueColor={BUILD_ENV === 'production' ? 'text-green-400' : 'text-amber-400'} />
          <InfoRow icon={Database} label="Base de données" value="PostgreSQL" valueColor="text-cyan-400" />
          <InfoRow icon={Shield} label="Authentification" value="Session + RBAC" />
          <InfoRow icon={Calendar} label="Année" value={currentYear.toString()} />
        </div>
      </Card>

      {/* Stack Technique */}
      <Card className="bg-slate-900 border-slate-800 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Code size={16} className="text-slate-400" />
          Stack Technique
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { name: 'React', version: '19.x' },
            { name: 'TypeScript', version: '5.x' },
            { name: 'Express', version: '4.x' },
            { name: 'Drizzle ORM', version: '0.39' },
            { name: 'TailwindCSS', version: '4.x' },
            { name: 'Vite', version: '7.x' },
          ].map((tech) => (
            <div key={tech.name} className="p-2.5 bg-slate-800/50 rounded-lg text-center">
              <p className="text-xs text-slate-300 font-medium">{tech.name}</p>
              <p className="text-[10px] text-slate-500">{tech.version}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-slate-500">
          © {currentYear} COFIN & CO-M. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}
