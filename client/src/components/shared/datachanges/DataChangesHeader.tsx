import React, { useState } from 'react';
import { GitCompare, Download, FileSpreadsheet, FileText, Shield } from 'lucide-react';
import Button from '../../ui/Button';
import SearchInput from '../../ui/SearchInput';
import SelectField from '../../ui/SelectField';
import Card from '../../ui/Card';

interface DataChangesHeaderProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  onExportJSON: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  filterTable: string;
  setFilterTable: (value: string) => void;
  filterOperation: string;
  setFilterOperation: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export default function DataChangesHeader({
  onExportCSV,
  onExportPDF,
  onExportJSON,
  searchTerm,
  setSearchTerm,
  filterTable,
  setFilterTable,
  filterOperation,
  setFilterOperation,
  onRefresh,
  loading
}: DataChangesHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-emerald-600 to-blue-600 border-0 p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Historique des Modifications</h2>
            <p className="text-emerald-100">Comparaison avant/après de toutes les modifications</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
                icon={Download}
              >
                Export
              </Button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50 min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                  <button onClick={() => { onExportCSV(); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white">
                    <FileSpreadsheet size={18} className="text-green-400" />
                    <div><div className="font-semibold">Excel (CSV)</div><div className="text-xs text-slate-400">Tableur compatible</div></div>
                  </button>
                  <button onClick={() => { onExportPDF(); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white border-t border-slate-700">
                    <FileText size={18} className="text-red-400" />
                    <div><div className="font-semibold">PDF</div><div className="text-xs text-slate-400">Document formaté</div></div>
                  </button>
                  <button onClick={() => { onExportJSON(); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-slate-700 transition flex items-center gap-3 text-white border-t border-slate-700">
                    <Shield size={18} className="text-blue-400" />
                    <div><div className="font-semibold">JSON</div><div className="text-xs text-slate-400">Données structurées</div></div>
                  </button>
                </div>
              )}
            </div>
            <GitCompare size={40} className="text-white/80 hidden sm:block" />
          </div>
        </div>
      </Card>

      <Card className="bg-slate-800 border-slate-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
             <SearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher..."
                className="w-full"
             />
          </div>

          <SelectField
            name="table"
            label="Table"
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            options={[
              { value: 'all', label: 'Toutes les tables' },
              { value: 'ecritures_comptables', label: 'Écritures Comptables' },
              { value: 'lignes_ecriture', label: 'Lignes d\'Écriture' },
              { value: 'plan_comptable_ohada', label: 'Plan Comptable' }
            ]}
          />

          <SelectField
            name="operation"
            label="Type d'opération"
            value={filterOperation}
            onChange={(e) => setFilterOperation(e.target.value)}
            options={[
              { value: 'all', label: 'Toutes les opérations' },
              { value: 'INSERT', label: 'Créations' },
              { value: 'UPDATE', label: 'Modifications' },
              { value: 'DELETE', label: 'Suppressions' }
            ]}
          />

          <Button
            onClick={onRefresh}
            variant="primary"
            isLoading={loading}
            fullWidth
            className="h-[42px] mt-0.5" // Align with inputs
          >
            Filtrer
          </Button>
        </div>
      </Card>
    </div>
  );
}
