import React, { useState } from 'react';
import { FileText, Download, Share2, Eye, X } from 'lucide-react';

interface TransactionRowActionsProps {
  factureId?: string;
  transactionId: string;
  onView?: (factureId: string) => void;
  onDownload?: (factureId: string) => void;
  onShare?: (factureId: string) => void;
  compact?: boolean;
}

export const TransactionRowActions: React.FC<TransactionRowActionsProps> = ({
  factureId,
  transactionId,
  onView,
  onDownload,
  onShare,
  compact = false
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // If no factureId, don't show actions
  if (!factureId) return null;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
           e.stopPropagation();
           setShowMenu(!showMenu);
        }}
        className={`hover:bg-slate-700 rounded-lg transition ${compact ? 'p-1' : 'p-2'}`}
        aria-label="Actions sur le reçu"
      >
        <FileText size={compact ? 14 : 16} className="text-slate-400 hover:text-emerald-400" />
      </button>

      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
            <button
              onClick={() => {
                onView?.(factureId);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2"
            >
              <Eye size={14} />
              Voir le reçu
            </button>
            <button
              onClick={() => {
                onDownload?.(factureId);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2"
            >
              <Download size={14} />
              Télécharger PDF
            </button>
            <button
              onClick={() => {
                onShare?.(factureId);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2"
            >
              <Share2 size={14} />
              Partager
            </button>
          </div>
        </>
      )}
    </div>
  );
};
