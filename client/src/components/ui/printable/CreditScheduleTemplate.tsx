import React from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Installment, getInstallmentStatusLabel } from '../../../lib/credit-logic';
import { StatutEcheanceCredit } from '@shared/enum/status-constants';
import { MapPin, Phone, Mail, QrCode } from 'lucide-react';
import { formatClientName, formatPhoneNumber } from '../../../lib/format';
import { formatMoney } from '@shared/config/currency';

interface CreditSchedulePDFProps {
  credit: any;
  client: any;
  schedule: Installment[];
  companyInfo?: {
    nom: string;
    adresse: string;
    telephone: string;
    email: string;
    nif: string;
    rccm: string;
  };
}

const DEFAULT_COMPANY_INFO = {
  nom: 'COFIN&CO',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@microflex-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234'
};

export const CreditSchedulePDF = React.forwardRef<HTMLDivElement, CreditSchedulePDFProps>(
  ({ credit, client, schedule, companyInfo: companyInfoProp = DEFAULT_COMPANY_INFO }, ref) => {
    const { branding } = useBranding();
    const companyInfo = { ...companyInfoProp, nom: companyInfoProp === DEFAULT_COMPANY_INFO ? branding.appName : companyInfoProp.nom };
    const totalPrincipal = parseFloat(credit.montant) || 0;
    const totalWithInterest = parseFloat(credit.totalDu) || 0;

    return (
      <div className="hidden print:block font-sans text-content-primary bg-white" ref={ref}>
        <style type="text/css" media="print">
          {`
            @page { size: A4; margin: 15mm; }
            body { -webkit-print-color-adjust: exact; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
            th { background-color: #f8fafc; font-weight: bold; }
          `}
        </style>

        <div className="max-w-[210mm] mx-auto p-4 min-h-[297mm] flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-edge pb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 bg-status-info flex items-center justify-center rounded-lg text-white font-bold text-xl">
                  CO
                </div>
                <h1 className="text-2xl font-extrabold text-content-primary uppercase">
                  {companyInfo.nom}
                </h1>
              </div>
              <div className="text-xs text-content-muted space-y-1">
                <p><MapPin size={12} className="inline mr-1" /> {companyInfo.adresse}</p>
                <p><Phone size={12} className="inline mr-1" /> {formatPhoneNumber(companyInfo.telephone)}</p>
                <p><Mail size={12} className="inline mr-1" /> {companyInfo.email}</p>
                <p>NIF: {companyInfo.nif} • RCCM: {companyInfo.rccm}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black text-content-secondary uppercase tracking-widest">ÉCHÉANCIER</h2>
              <p className="font-mono text-lg font-bold">#{credit.numeroCredit}</p>
              <p className="text-sm text-content-muted">Généré le {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="bg-surface-muted p-4 rounded-lg border border-edge">
              <h3 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-2">Client</h3>
              <p className="font-bold text-lg">{formatClientName(client.nom, client.prenom)}</p>
              <p className="text-sm">Tél: {formatPhoneNumber(client.telephone)}</p>
              <p className="text-sm">Compte: {client.numeroCompte || 'N/A'}</p>
            </div>
            <div className="bg-surface-muted p-4 rounded-lg border border-edge">
              <h3 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-2">Résumé du Crédit</h3>
              <div className="grid grid-cols-2 gap-x-4 text-sm">
                <span className="text-content-muted">Montant Initial:</span>
                <span className="font-bold">{formatMoney(totalPrincipal)}</span>
                <span className="text-content-muted">Taux:</span>
                <span className="font-bold">{credit.taux}%</span>
                <span className="text-content-muted">Total à payer:</span>
                <span className="font-bold">{formatMoney(totalWithInterest)}</span>
                <span className="text-content-muted">Fréquence:</span>
                <span className="font-bold">{credit.echeance}</span>
              </div>
            </div>
          </div>

          {/* Schedule Table */}
          <table className="w-full text-sm mb-8">
            <thead>
              <tr>
                <th className="w-12 text-center">N°</th>
                <th>Date d'échéance</th>
                <th className="text-right">Montant</th>
                <th className="text-right">Reste à payer</th>
                <th className="text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((item) => (
                <tr key={item.number}>
                  <td className="text-center">{item.number}</td>
                  <td>{format(item.dueDate, 'dd MMMM yyyy', { locale: fr })}</td>
                  <td className="text-right font-mono">{formatMoney(item.amount)}</td>
                  <td className="text-right font-mono">{formatMoney(item.remainingBalance)}</td>
                  <td className="text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                      item.status === StatutEcheanceCredit.PAID || item.status === StatutEcheanceCredit.SETTLED ? 'bg-status-success-bg text-status-success' :
                      item.status === StatutEcheanceCredit.LATE ? 'bg-status-danger-bg text-status-danger' :
                      'bg-surface-muted text-content-muted'
                    }`}>
                      {getInstallmentStatusLabel(item.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="mt-auto border-t border-edge pt-6 flex justify-between items-end">
             <div className="text-[10px] text-content-muted w-2/3">
                Ce document constitue l'échéancier officiel de remboursement de votre crédit. 
                Tout retard de paiement peut entraîner des pénalités conformément aux conditions générales.
                Document certifié par {branding.appName}.
             </div>
             <div className="flex flex-col items-center">
                <QrCode size={48} className="text-content-muted mb-1" />
                <span className="text-[8px] text-content-secondary">SCAN POUR VÉRIFIER</span>
             </div>
          </div>
        </div>
      </div>
    );
  }
);

CreditSchedulePDF.displayName = 'CreditSchedulePDF';

