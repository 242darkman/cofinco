import React, { useState, useRef } from 'react';
import { FileSpreadsheet, Upload, Download, Plus, Trash2, RefreshCw, Users, CreditCard, PiggyBank, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { useExcelSheet, ExcelRow } from '../../hooks/useExcelSheet';
import { TabGroup, Button, Card, Modal, Badge, IconButton, PageHeader, EmptyState } from '../ui';

const DATA_TYPES = [
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'credits', label: 'Crédits', icon: CreditCard },
  { id: 'epargnes', label: 'Épargnes', icon: PiggyBank }
];

const CLIENT_COLUMNS = ['nom', 'prenom', 'telephone', 'email', 'adresse', 'ville', 'profession', 'segment'];
const CREDIT_COLUMNS = ['clientId', 'montant', 'taux', 'duree', 'typeCredit', 'objetCredit', 'statut'];
const EPARGNE_COLUMNS = ['clientId', 'typeCompte', 'solde', 'tauxInteret'];

export default function ExcelModule() {
  const [activeTab, setActiveTab] = useState('spreadsheet');
  const [selectedDataType, setSelectedDataType] = useState<string>('clients');
  const [showImportModal, setShowImportModal] = useState(false);
  const [fullImportData, setFullImportData] = useState<ExcelRow[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<{row: number, col: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    spreadsheetData, setSpreadsheetData, columns, setColumns,
    addRow, addColumn, removeRow, updateCell, setDataType,
    importing, exporting, importResult, parseExcelFile, processImport, handleExport, setImportResult
  } = useExcelSheet({ initialColumns: CLIENT_COLUMNS });

  const getColumnsForType = (type: string): string[] => {
    switch (type) {
      case 'clients': return CLIENT_COLUMNS;
      case 'credits': return CREDIT_COLUMNS;
      case 'epargnes': return EPARGNE_COLUMNS;
      default: return ['Colonne 1', 'Colonne 2', 'Colonne 3'];
    }
  };

  const handleDataTypeChange = (type: string) => {
    setSelectedDataType(type);
    setDataType(getColumnsForType(type));
  };

  const validateClientRow = (row: ExcelRow, index: number) => {
    const nom = row.nom || row.Nom || '';
    if (!nom || nom.trim() === '') return { valid: false, error: `Ligne ${index + 2}: Nom obligatoire` };
    return {
      valid: true,
      body: {
        nom: nom.trim(),
        prenom: (row.prenom || row.Prenom || '').trim(),
        telephone: (row.telephone || row.Telephone || '').trim() || null,
        email: (row.email || row.Email || '').trim() || null,
        adresse: (row.adresse || row.Adresse || '').trim() || null,
        ville: (row.ville || row.Ville || 'Brazzaville').trim(),
        pays: 'République du Congo',
        profession: (row.profession || row.Profession || '').trim() || null,
        segment: (row.segment || row.Segment || 'Standard').trim(),
        status: 'Actif', score: 50, tauxRemboursement: '100', pointsFidelite: 0
      }
    };
  };

  const validateCreditRow = (row: ExcelRow, index: number) => {
    const clientId = row.clientId || row.ClientId || row.client_id || '';
    const montant = row.montant || row.Montant || '';
    if (!clientId) return { valid: false, error: `Ligne ${index + 2}: Client ID manquant` };
    if (!montant || parseFloat(montant) <= 0) return { valid: false, error: `Ligne ${index + 2}: Montant invalide` };
    return {
      valid: true,
      body: {
        clientId: clientId.trim(), montant: String(montant),
        taux: String(row.taux || row.Taux || '12'),
        duree: parseInt(row.duree || row.Duree || '12'),
        typeCredit: (row.typeCredit || row.TypeCredit || 'Personnel').trim(),
        objetCredit: (row.objetCredit || row.ObjetCredit || '').trim(),
        statut: (row.statut || row.Statut || 'En attente').trim(), echeance: 'Mensuel'
      }
    };
  };

  const confirmImport = async () => {
    if (fullImportData.length === 0) return;
    let validator, endpoint = '';
    if (selectedDataType === 'clients') { validator = validateClientRow; endpoint = '/api/clients'; }
    else if (selectedDataType === 'credits') { validator = validateCreditRow; endpoint = '/api/credits'; }
    else { alert('Import non supporté'); return; }
    await processImport(fullImportData, validator, endpoint);
    setShowImportModal(false);
    setFullImportData([]);
  };

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const jsonData = await parseExcelFile(file);
      if (jsonData.length > 0) {
        setPreviewColumns(Object.keys(jsonData[0]));
        setFullImportData(jsonData);
        setShowImportModal(true);
      } else { alert('Fichier vide'); }
    } catch (err) { console.error(err); alert('Erreur lecture fichier'); }
    if (event.target) event.target.value = '';
  };

  const triggerExport = () => {
    let endpoint = '';
    if (selectedDataType === 'clients') endpoint = '/api/clients';
    else if (selectedDataType === 'credits') endpoint = '/api/credits';
    handleExport(selectedDataType, endpoint, `${selectedDataType}_cofin`);
  };

  const loadDataFromAPI = async () => {
    let endpoint = '';
    if (selectedDataType === 'clients') endpoint = '/api/clients';
    else if (selectedDataType === 'credits') endpoint = '/api/credits';
    else return;
    try {
      const res = await fetch(endpoint, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) { setSpreadsheetData(data); setColumns(Object.keys(data[0])); }
      }
    } catch (e) { console.error(e); }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (e.key === 'Tab') {
        const nextCol = e.shiftKey ? colIndex - 1 : colIndex + 1;
        if (nextCol >= 0 && nextCol < columns.length) setSelectedCell({ row: rowIndex, col: nextCol });
        else if (nextCol >= columns.length && rowIndex < spreadsheetData.length - 1) setSelectedCell({ row: rowIndex + 1, col: 0 });
      } else if (e.key === 'Enter') {
        const nextRow = e.shiftKey ? rowIndex - 1 : rowIndex + 1;
        if (nextRow >= 0 && nextRow < spreadsheetData.length) setSelectedCell({ row: nextRow, col: colIndex });
      }
    } else if (e.key === 'ArrowUp' && rowIndex > 0) setSelectedCell({ row: rowIndex - 1, col: colIndex });
    else if (e.key === 'ArrowDown' && rowIndex < spreadsheetData.length - 1) setSelectedCell({ row: rowIndex + 1, col: colIndex });
    else if (e.key === 'ArrowLeft' && colIndex > 0) setSelectedCell({ row: rowIndex, col: colIndex - 1 });
    else if (e.key === 'ArrowRight' && colIndex < columns.length - 1) setSelectedCell({ row: rowIndex, col: colIndex + 1 });
  };

  return (
    <div className="space-y-3 pb-20 sm:pb-4">
      {/* Header - Compact */}
      <div className="mb-2">
        <h2 className="text-lg font-bold text-content-primary">Gestion Excel</h2>
        <p className="text-xs text-content-muted">Import/Export de données</p>
      </div>

      {/* Tabs - Scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <TabGroup
          tabs={[
            { key: 'spreadsheet', label: 'Feuille', icon: FileSpreadsheet },
            { key: 'import', label: 'Importer', icon: Upload },
            { key: 'export', label: 'Exporter', icon: Download }
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          size="sm"
        />
      </div>

      {/* Data Type Selector - Horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:gap-2">
        {DATA_TYPES.map(type => (
          <Button
            key={type.id}
            variant={selectedDataType === type.id ? 'primary' : 'ghost'}
            onClick={() => handleDataTypeChange(type.id)}
            size="sm"
            icon={type.icon}
            className="shrink-0 text-xs"
          >
            {type.label}
          </Button>
        ))}
      </div>

      {/* Spreadsheet View */}
      {activeTab === 'spreadsheet' && (
        <Card variant="default" padding="none">
          {/* Action Bar - Compact grid on mobile */}
          <div className="p-2 border-b border-edge flex flex-wrap gap-1.5">
            <Button onClick={addRow} variant="success" size="sm" icon={Plus} className="text-xs">Ligne</Button>
            <Button onClick={addColumn} variant="primary" size="sm" icon={Plus} className="text-xs">Colonne</Button>
            <Button onClick={loadDataFromAPI} variant="secondary" size="sm" icon={RefreshCw} className="text-xs">Charger</Button>
            <Button onClick={triggerExport} disabled={exporting} variant="outline" size="sm" icon={Download} className="text-xs">
              {exporting ? '...' : 'Export'}
            </Button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {spreadsheetData.length === 0 ? (
              <EmptyState
                icon={FileSpreadsheet}
                title="Tableau vide"
                description="Importez des données ou ajoutez une ligne"
              />
            ) : (
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-surface-muted text-content-primary sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left w-8 font-mono text-[10px]">#</th>
                    {columns.map((col, idx) => (
                      <th key={idx} className="px-2 py-2 text-left min-w-[100px] sm:min-w-[120px] font-semibold text-xs border-l border-edge truncate max-w-[120px]">
                        {col}
                      </th>
                    ))}
                    <th className="px-1 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {spreadsheetData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-surface-muted/50 transition-colors">
                      <td className="px-2 py-1 text-content-muted font-mono text-[10px]">{rowIndex + 1}</td>
                      {columns.map((col, colIndex) => (
                        <td key={colIndex} className="px-0 py-0 border-l border-edge">
                          <input
                            value={row[col] ?? ''}
                            onChange={(e) => updateCell(rowIndex, col, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                            onFocus={() => setSelectedCell({ row: rowIndex, col: colIndex })}
                            className={`w-full px-2 py-1.5 bg-transparent text-content-primary text-xs focus:bg-primary/10 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary transition-all ${
                              selectedCell?.row === rowIndex && selectedCell?.col === colIndex ? 'bg-primary/10' : ''
                            }`}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <IconButton icon={Trash2} size="sm" variant="ghost" onClick={() => removeRow(rowIndex)} aria-label="Supprimer" className="text-content-muted hover:text-danger" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* Import View */}
      {activeTab === 'import' && (
        <div className="space-y-4">
          <Card variant="default" padding="none">
            <div 
              className="border-2 border-dashed border-edge rounded-xl p-6 sm:p-10 text-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-surface-muted rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-content-primary mb-1">Importer un fichier</h3>
              <p className="text-xs sm:text-sm text-content-muted">Glissez ou cliquez pour parcourir</p>
              <p className="text-[10px] text-content-muted mt-3 uppercase tracking-wider">.xlsx, .csv</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileUpload} className="hidden" />
            </div>
          </Card>
          
          {importResult && (
            <Card variant="default" padding="sm" className={importResult.errors.length > 0 ? 'border-warning/50' : 'border-success/50'}>
              <div className="flex items-center gap-2">
                {importResult.errors.length > 0 ? 
                  <AlertTriangle className="text-warning shrink-0" size={18} /> : 
                  <CheckCircle className="text-success shrink-0" size={18} />
                }
                <span className={`font-semibold text-sm ${importResult.errors.length > 0 ? 'text-warning' : 'text-success'}`}>
                  {importResult.success} importé(s). {importResult.errors.length} erreur(s).
                </span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-2 pl-6 text-xs text-content-muted max-h-32 overflow-y-auto space-y-0.5">
                  {importResult.errors.map((e, i) => <p key={i}>• {e}</p>)}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Export View */}
      {activeTab === 'export' && (
        <Card variant="default" className="text-center py-10 sm:py-14">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download className="w-7 h-7 sm:w-8 sm:h-8 text-success" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-content-primary mb-1">Exporter les données</h3>
          <p className="text-xs sm:text-sm text-content-muted mb-6 max-w-xs mx-auto">
            Télécharger <span className="text-primary font-mono">{selectedDataType}</span> en Excel
          </p>
          <Button onClick={triggerExport} disabled={exporting} variant="success" size="md" icon={Download}>
            {exporting ? 'Génération...' : 'Télécharger'}
          </Button>
        </Card>
      )}

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Aperçu de l'import"
        size="xl"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={() => setShowImportModal(false)}>Annuler</Button>
            <Button variant="success" size="sm" onClick={confirmImport} disabled={importing}>
              {importing ? 'Import...' : `Confirmer (${fullImportData.length})`}
            </Button>
          </div>
        }
      >
        <div className="overflow-x-auto max-h-[50vh] border border-edge rounded-lg text-xs">
          <table className="w-full text-left">
            <thead className="bg-surface-muted text-content-primary sticky top-0">
              <tr>{previewColumns.map((c, i) => <th key={i} className="px-2 py-1.5 font-medium whitespace-nowrap">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {fullImportData.slice(0, 10).map((r, i) => (
                <tr key={i} className="hover:bg-surface-muted/50">
                  {previewColumns.map((c, k) => <td key={k} className="px-2 py-1.5 text-content-muted whitespace-nowrap">{String(r[c] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {fullImportData.length > 10 && (
            <div className="p-2 text-center text-[10px] text-content-muted bg-surface-muted border-t border-edge">
              + {fullImportData.length - 10} lignes
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge value="Info" variant="info" size="sm" />
          <p className="text-[10px] text-content-muted">Les colonnes manquantes seront ignorées.</p>
        </div>
      </Modal>
    </div>
  );
}
