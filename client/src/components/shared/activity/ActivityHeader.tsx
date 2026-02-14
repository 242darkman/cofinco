import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Shield } from 'lucide-react';
import Button from '../../ui/Button';

interface ActivityHeaderProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  onExportJSON: () => void;
}

export default function ActivityHeader({ onExportCSV, onExportPDF, onExportJSON }: ActivityHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="bg-gradient-to-br from-accent to-status-info rounded-2xl p-6 text-white shadow-xl shadow-status-info/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2">Activité des Utilisateurs</h2>
          <p className="text-accent">Suivi et analyse des comportements</p>
        </div>
        <div className="relative">
          <Button 
            onClick={() => setShowExportMenu(!showExportMenu)}
            variant="ghost"
            className="bg-white/20 hover:bg-white/30 text-white border-none"
            icon={Download}
          >
            Exporter
          </Button>
          
          {showExportMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowExportMenu(false)}
              ></div>
              <div className="absolute right-0 top-full mt-2 bg-surface rounded-xl shadow-xl border border-edge overflow-hidden z-50 min-w-[220px] animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={() => { onExportCSV(); setShowExportMenu(false); }} 
                  className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary group"
                >
                  <div className="p-2 bg-status-success-bg rounded-lg text-status-success group-hover:text-status-success group-hover:bg-status-success/30 transition-colors">
                    <FileSpreadsheet size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Excel (CSV)</div>
                    <div className="text-xs text-content-muted">Tableur compatible</div>
                  </div>
                </button>
                <div className="h-px bg-surface-elevated my-0"></div>
                <button 
                  onClick={() => { onExportPDF(); setShowExportMenu(false); }} 
                  className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary group"
                >
                  <div className="p-2 bg-status-danger-bg rounded-lg text-status-danger group-hover:text-status-danger group-hover:bg-status-danger/30 transition-colors">
                    <FileText size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">PDF</div>
                    <div className="text-xs text-content-muted">Document formaté</div>
                  </div>
                </button>
                <div className="h-px bg-surface-elevated my-0"></div>
                <button 
                  onClick={() => { onExportJSON(); setShowExportMenu(false); }} 
                  className="w-full px-4 py-3 text-left hover:bg-surface-elevated transition flex items-center gap-3 text-content-primary group"
                >
                  <div className="p-2 bg-status-info-bg rounded-lg text-status-info group-hover:text-status-info group-hover:bg-status-info/30 transition-colors">
                    <Shield size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">JSON</div>
                    <div className="text-xs text-content-muted">Données structurées</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
