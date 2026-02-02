import React, { useState, useEffect } from 'react';
import {
  Package, Code, Calendar, Server, Database, Globe, Shield,
  Cpu, HardDrive, Zap, ExternalLink, CheckCircle, Clock
} from 'lucide-react';
import { cn } from '../../lib/utils';

const BUILD_VERSION = '1.0.0';
const BUILD_ENV = import.meta.env.MODE || 'development';

const TECH_STACK = [
  { name: 'React', version: '19.x', icon: '⚛️', color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30' },
  { name: 'TypeScript', version: '5.x', icon: '📘', color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30' },
  { name: 'Express', version: '4.x', icon: '🚀', color: 'from-slate-500/20 to-slate-600/20 border-slate-500/30' },
  { name: 'PostgreSQL', version: '16', icon: '🐘', color: 'from-blue-600/20 to-blue-700/20 border-blue-600/30' },
  { name: 'Drizzle', version: '0.39', icon: '💧', color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30' },
  { name: 'TailwindCSS', version: '4.x', icon: '🎨', color: 'from-sky-500/20 to-cyan-500/20 border-sky-500/30' },
  { name: 'Vite', version: '7.x', icon: '⚡', color: 'from-purple-500/20 to-violet-500/20 border-purple-500/30' },
  { name: 'MinIO', version: 'S3', icon: '📦', color: 'from-red-500/20 to-orange-500/20 border-red-500/30' },
];

const FEATURES = [
  { name: 'Double-Entry Accounting', status: true },
  { name: 'Multi-Agency Support', status: true },
  { name: 'RBAC Permissions', status: true },
  { name: 'Real-time Updates', status: true },
  { name: 'Offline Mode (PWA)', status: true },
  { name: 'Audit Trail', status: true },
];

export default function AdminVersionInfo() {
  const currentYear = new Date().getFullYear();
  const [versionData, setVersionData] = useState({
    version: BUILD_VERSION,
    environment: BUILD_ENV
  });

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const res = await fetch('/api/version');
        if (res.ok) {
          const data = await res.json();
          setVersionData({
            version: data.version,
            environment: data.environment
          });
        }
      } catch (e) {
        // Fallback to build values
      }
    };
    fetchVersion();
  }, []);

  const isProduction = versionData.environment === 'production';

  return (
    <div className="space-y-4">
      {/* Compact Header with Version */}
      <div className="bg-linear-to-br from-indigo-600/90 via-blue-600/90 to-cyan-600/90 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">v{versionData.version}</h2>
                <span className={cn(
                  "px-2 py-0.5 text-[10px] font-bold uppercase rounded-full",
                  isProduction
                    ? "bg-emerald-500/30 text-emerald-200"
                    : "bg-amber-500/30 text-amber-200"
                )}>
                  {isProduction ? 'Production' : 'Dev'}
                </span>
              </div>
              <p className="text-[11px] text-blue-100/80">COFIN & CO-M Platform</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="hidden sm:flex items-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{TECH_STACK.length}</p>
              <p className="text-[9px] text-blue-100/70 uppercase">Technologies</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-300">{FEATURES.filter(f => f.status).length}</p>
              <p className="text-[9px] text-blue-100/70 uppercase">Features</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{currentYear}</p>
              <p className="text-[9px] text-blue-100/70 uppercase">Year</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* System Info - Compact */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Server size={12} />
            Système
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <InfoTile icon={Code} label="Version" value={`v${versionData.version}`} color="text-blue-400" />
            <InfoTile icon={Globe} label="Env" value={isProduction ? 'Prod' : 'Dev'} color={isProduction ? 'text-emerald-400' : 'text-amber-400'} />
            <InfoTile icon={Database} label="DB" value="PostgreSQL 16" color="text-cyan-400" />
            <InfoTile icon={Shield} label="Auth" value="Session+RBAC" color="text-purple-400" />
            <InfoTile icon={HardDrive} label="Storage" value="MinIO S3" color="text-orange-400" />
            <InfoTile icon={Zap} label="Runtime" value="Node.js" color="text-green-400" />
          </div>
        </div>

        {/* Features Status - Compact */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle size={12} />
            Fonctionnalités
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {FEATURES.map((feature) => (
              <div
                key={feature.name}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/30 rounded-lg"
              >
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  feature.status ? "bg-emerald-400" : "bg-slate-600"
                )} />
                <span className="text-[11px] text-slate-300 truncate">{feature.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tech Stack - Compact Grid */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Cpu size={12} />
          Stack Technique
        </h3>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {TECH_STACK.map((tech) => (
            <div
              key={tech.name}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-lg bg-linear-to-br border transition-transform hover:scale-105",
                tech.color
              )}
            >
              <span className="text-lg mb-0.5">{tech.icon}</span>
              <span className="text-[10px] font-medium text-white">{tech.name}</span>
              <span className="text-[8px] text-slate-400">{tech.version}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer - Minimal */}
      <div className="flex items-center justify-between px-2 py-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Clock size={10} />
          <span>Build: {new Date().toLocaleDateString('fr-FR')}</span>
        </div>
        <span>© {currentYear} COFIN & CO-M</span>
      </div>
    </div>
  );
}

// Compact Info Tile Component
function InfoTile({ icon: Icon, label, value, color = 'text-white' }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-800/40 rounded-lg">
      <Icon size={12} className="text-slate-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[9px] text-slate-500 uppercase">{label}</p>
        <p className={cn("text-xs font-medium truncate", color)}>{value}</p>
      </div>
    </div>
  );
}
