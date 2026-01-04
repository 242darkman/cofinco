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
    <div className="bg-gradient-to-br from-cyan-600 to-blue-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-900/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2">Activité des Utilisateurs</h2>
          <p className="text-cyan-100">Suivi et analyse des comportements</p>
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
              <div className="absolute right-0 top-full mt-2 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50 min-w-[220px] animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={() => { onExportCSV(); setShowExportMenu(false); }} 
                  className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white group"
                >
                  <div className="p-2 bg-green-500/20 rounded-lg text-green-400 group-hover:text-green-300 group-hover:bg-green-500/30 transition-colors">
                    <FileSpreadsheet size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Excel (CSV)</div>
                    <div className="text-xs text-slate-400">Tableur compatible</div>
                  </div>
                </button>
                <div className="h-px bg-slate-700 my-0"></div>
                <button 
                  onClick={() => { onExportPDF(); setShowExportMenu(false); }} 
                  className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white group"
                >
                  <div className="p-2 bg-red-500/20 rounded-lg text-red-400 group-hover:text-red-300 group-hover:bg-red-500/30 transition-colors">
                    <FileText size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">PDF</div>
                    <div className="text-xs text-slate-400">Document formaté</div>
                  </div>
                </button>
                <div className="h-px bg-slate-700 my-0"></div>
                <button 
                  onClick={() => { onExportJSON(); setShowExportMenu(false); }} 
                  className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white group"
                >
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 group-hover:text-blue-300 group-hover:bg-blue-500/30 transition-colors">
                    <Shield size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">JSON</div>
                    <div className="text-xs text-slate-400">Données structurées</div>
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
