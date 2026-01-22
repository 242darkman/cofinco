import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Building2, Phone, Mail, MapPin } from 'lucide-react';
import { formatMoney } from '../../../lib/format';
import { StatutTransfertCaisse } from '@shared/enum/status-constants';

export interface TransferHistoryData {
  title: string;
  agencyName: string;
  generatedBy: string;
  date: Date | string;
  filters?: {
    startDate?: string;
    endDate?: string;
    status?: string;
  };
  transfers: Array<{
    reference: string;
    date: string;
    source: string;
    destination: string;
    montant: number;
    initiator: string;
    statut: string;
  }>;
  stats: {
    totalCount: number;
    totalAmount: number;
  };
}

interface TransferHistoryPrintTemplateProps {
  data: TransferHistoryData;
  companyInfo?: {
    nom: string;
    adresse: string;
    telephone: string;
    email: string;
    nif?: string;
    rccm?: string;
  };
}

const DEFAULT_COMPANY_INFO = {
  nom: 'COFIN&CO',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@cofinco-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234'
};

export const TransferHistoryPrintTemplate = React.forwardRef<HTMLDivElement, TransferHistoryPrintTemplateProps>(
  ({ data, companyInfo = DEFAULT_COMPANY_INFO }, ref) => {
    
    const formattedDate = new Date(data.date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return (
      <div className="hidden print:block font-sans text-slate-900 bg-white" ref={ref}>
        <style type="text/css" media="print">
          {`
            @page { size: landscape; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
          `}
        </style>

        <div className="w-full max-w-[297mm] mx-auto p-8">
          
          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-slate-900 pb-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 mb-2">
                 <div className="h-10 w-10 bg-blue-900 flex items-center justify-center rounded-lg text-white font-bold text-lg">
                   CO
                 </div>
                 <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">
                   {companyInfo.nom}
                 </h1>
              </div>
              
              <div className="text-xs text-slate-600 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <MapPin size={12} /> {companyInfo.adresse}
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={12} /> {companyInfo.telephone}
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={12} /> {companyInfo.email}
                </div>
              </div>
            </div>

            <div className="text-right">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wide mb-2">
                HISTORIQUE DES TRANSFERTS
              </h2>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Agence: {data.agencyName}</span>
                <span className="text-slate-500">Généré le: {formattedDate}</span>
                <span className="text-slate-500">Par: {data.generatedBy}</span>
              </div>
            </div>
          </div>

          {/* Filters Summary (if any) */}
          {(data.filters?.startDate || data.filters?.endDate || data.filters?.status) && (
             <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded text-sm flex gap-6">
                <span className="font-bold text-slate-700">Filtres appliqués:</span>
                {data.filters.startDate && <span>Du: {new Date(data.filters.startDate).toLocaleDateString('fr-FR')}</span>}
                {data.filters.endDate && <span>Au: {new Date(data.filters.endDate).toLocaleDateString('fr-FR')}</span>}
                {data.filters.status && <span>Statut: {data.filters.status}</span>}
             </div>
          )}

          {/* Table */}
          <table className="w-full mb-8 text-sm">
            <thead>
              <tr className="border-b-2 border-slate-900 bg-slate-100">
                <th className="py-2 px-2 text-left font-bold text-slate-900 uppercase">Date</th>
                <th className="py-2 px-2 text-left font-bold text-slate-900 uppercase">Référence</th>
                <th className="py-2 px-2 text-left font-bold text-slate-900 uppercase">Source</th>
                <th className="py-2 px-2 text-left font-bold text-slate-900 uppercase">Destination</th>
                <th className="py-2 px-2 text-left font-bold text-slate-900 uppercase">Initié par</th>
                <th className="py-2 px-2 text-left font-bold text-slate-900 uppercase">Statut</th>
                <th className="py-2 px-2 text-right font-bold text-slate-900 uppercase">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.transfers.map((t, index) => (
                <tr key={index} className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50">
                  <td className="py-2 px-2 text-slate-600">
                    {new Date(t.date).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-2 px-2 font-mono text-slate-900 font-medium">
                    {t.reference}
                  </td>
                  <td className="py-2 px-2 text-slate-700">{t.source}</td>
                  <td className="py-2 px-2 text-slate-700">{t.destination}</td>
                  <td className="py-2 px-2 text-slate-600 italic">{t.initiator}</td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                        (t.statut === StatutTransfertCaisse.VALIDATED) ? 'bg-green-100 text-green-800 border-green-200' :
                        (t.statut === StatutTransfertCaisse.PENDING) ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        'bg-slate-100 text-slate-800 border-slate-200'
                    }`}>
                        {t.statut}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-slate-900 font-mono">
                    {formatMoney(t.montant)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
               <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                  <td colSpan={6} className="py-3 px-4 text-right uppercase tracking-wider">Total ({data.stats.totalCount} transferts)</td>
                  <td className="py-3 px-4 text-right font-mono text-lg">{formatMoney(data.stats.totalAmount)}</td>
               </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div className="mt-auto pt-6 text-center border-t border-slate-200">
             <p className="text-[10px] text-slate-400">
                Document généré automatiquement par la plateforme COFIN&CO.
             </p>
          </div>
        </div>
      </div>
    );
  }
);

TransferHistoryPrintTemplate.displayName = 'TransferHistoryPrintTemplate';
