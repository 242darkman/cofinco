import React from 'react';
import { FileText } from 'lucide-react';
import { Card, LoadingSpinner } from '../../ui';

interface ReportPreviewProps {
  data: any[];
  columns: string[];
  getRow: (item: any) => string[];
  loading: boolean;
}

export default function ReportPreview({ data, columns, getRow, loading }: ReportPreviewProps) {
  if (!data.length && !loading) return null;

  return (
    <Card variant="default" padding="none">
      <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-edge flex items-center gap-2">
        <FileText className="text-primary shrink-0" size={16} />
        <h3 className="text-sm font-semibold text-content-primary">Aperçu ({data.length})</h3>
      </div>
      
      {loading ? (
        <div className="p-8 flex justify-center">
          <LoadingSpinner size="md" text="Chargement..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-surface-muted">
              <tr>
                {columns.map((col, idx) => (
                  <th key={idx} className="px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-content-muted uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {data.slice(0, 5).map((item, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors">
                  {getRow(item).map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-content-secondary whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.length > 5 && (
            <div className="px-3 py-2 text-center bg-surface-muted border-t border-edge">
              <p className="text-[10px] text-content-muted">+ {data.length - 5} autres</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
