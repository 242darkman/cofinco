import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Badge, Card } from '../index';
import { Building2, Phone, Mail, Globe, MapPin, QrCode } from 'lucide-react';
import cofinLogo from '@/assets/logo.png';

export interface ReceiptData {
  title: string;
  reference: string;
  date: Date | string;
  type: string;
  client?: {
    nom: string;
    prenom?: string;
    telephone?: string;
    email?: string;
    adresse?: string;
    numeroCompte?: string;
  };
  agent?: {
    nom: string;
    prenom?: string;
    id?: string;
  };
  items: Array<{
    description: string;
    quantite?: number;
    prixUnitaire?: number;
    montant: number;
    details?: string;
  }>;
  tax?: number;
  total: number;
  montantLettres?: string;
  notes?: string;
  modePaiement?: string;
  devise?: string;
}

interface ReceiptTemplateProps {
  data: ReceiptData;
  companyInfo?: {
    nom: string;
    adresse: string;
    telephone: string;
    email: string;
    siteWeb?: string;
    nif?: string;
    rccm?: string;
  };
}

// Default Company Info (TODO: Move to env or context)
const DEFAULT_COMPANY_INFO = {
  nom: 'COFIN&CO',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@cofinco-m.com',
  siteWeb: 'www.cofinco-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234'
};

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, ReceiptTemplateProps>(
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
        {/* Print specific styles to ensure background colors print */}
        <style type="text/css" media="print">
          {`
            @page { size: auto; margin: 0mm; }
            body { -webkit-print-color-adjust: exact; }
          `}
        </style>

        <div className="max-w-[210mm] mx-auto p-8 min-h-[297mm] flex flex-col relative">
          
          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-slate-900 pb-6">
            <div className="flex flex-col gap-2">
              {/* Logo Placeholder */}
              <div className="flex items-center gap-3 mb-2">
                 {/* Try to use the imported logo, fallback to text if fails */}
                 <div className="h-12 w-12 bg-blue-900 flex items-center justify-center rounded-lg text-white font-bold text-xl">
                   CO
                 </div>
                 <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 uppercase">
                   {companyInfo.nom}
                 </h1>
              </div>
              
              <div className="text-sm text-slate-600 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <MapPin size={14} /> {companyInfo.adresse}
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} /> {companyInfo.telephone}
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} /> {companyInfo.email}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <span>NIF: {companyInfo.nif}</span> • <span>RCCM: {companyInfo.rccm}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <h2 className="text-4xl font-black text-slate-200 uppercase tracking-widest mb-2">
                REÇU
              </h2>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-lg font-bold text-slate-900">#{data.reference}</span>
                <span className="text-sm text-slate-500">{formattedDate}</span>
                <Badge 
                  variant="outline" 
                  className="ml-auto mt-2 border-slate-900 text-slate-900"
                  value={data.type}
                />
              </div>
            </div>
          </div>

          {/* Client & Info Grid */}
          <div className="grid grid-cols-2 gap-12 mb-10">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Client</h3>
              <div className="space-y-1">
                <p className="font-bold text-lg text-slate-900 uppercase">
                  {data.client?.nom} {data.client?.prenom}
                </p>
                {data.client?.numeroCompte && (
                  <p className="text-sm font-mono text-slate-600">
                    Compte: {data.client?.numeroCompte}
                  </p>
                )}
                <p className="text-sm text-slate-600">{data.client?.telephone}</p>
                <p className="text-sm text-slate-600">{data.client?.email}</p>
                {data.modePaiement && (
                   <p className="text-sm mt-3 pt-3 border-t border-slate-200">
                      <span className="text-slate-500">Mode: </span>
                      <span className="font-medium">{data.modePaiement}</span>
                   </p>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Émis par</h3>
               <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                     {data.agent?.nom} {data.agent?.prenom}
                  </p>
                  <p className="text-sm text-slate-500 italic">Agent certifié COFIN&CO</p>
                  <div className="mt-4 flex justify-center">
                     {/* QR Code Placeholder for authenticity */}
                     <div className="border-2 border-slate-900 p-2 rounded-lg bg-white">
                        <QrCode size={64} className="text-slate-900" />
                     </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="flex-grow">
            <table className="w-full mb-8">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="py-3 text-left text-sm font-bold text-slate-900 uppercase w-3/5">Description</th>
                  <th className="py-3 text-right text-sm font-bold text-slate-900 uppercase w-1/5">Qté/Taux</th>
                  <th className="py-3 text-right text-sm font-bold text-slate-900 uppercase w-1/5">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item, index) => (
                  <tr key={index} className="border-b border-slate-100 last:border-0">
                    <td className="py-4 pr-4 align-top">
                      <p className="font-bold text-slate-900">{item.description}</p>
                      {item.details && (
                        <p className="text-xs text-slate-500 mt-1">{item.details}</p>
                      )}
                    </td>
                    <td className="py-4 text-right align-top text-slate-600 font-mono">
                      {item.quantite ? item.quantite : '-'}
                    </td>
                    <td className="py-4 text-right align-top font-bold text-slate-900 font-mono">
                      {item.montant.toLocaleString('fr-FR')} {data.devise || 'FCFA'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-12">
            <div className="w-1/2">
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 px-4 bg-slate-900 text-white rounded-lg shadow-sm">
                  <span className="text-sm font-bold uppercase tracking-wider">Total Payé</span>
                  <span className="text-xl font-black font-mono">
                    {data.total.toLocaleString('fr-FR')} {data.devise || 'FCFA'}
                  </span>
                </div>
                {data.montantLettres && (
                   <p className="text-xs text-right text-slate-500 italic pr-1">
                      Arrêté la présente facture à la somme de : {data.montantLettres}
                   </p>
                )}
                {data.notes && (
                  <div className="mt-6 p-3 bg-yellow-50 border border-yellow-100 rounded text-xs text-slate-600">
                    <span className="font-bold block mb-1">Notes:</span>
                    {data.notes}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto border-t border-slate-200 pt-6 text-center">
             <p className="font-bold text-slate-900 mb-2">MERCI DE VOTRE CONFIANCE !</p>
             <p className="text-[10px] text-slate-400">
                Ce document est une preuve de paiement générée électroniquement par la plateforme COFIN&CO.
                Pour toute réclamation, veuillez présenter ce reçu dans un délai de 48h.
             </p>
             <p className="text-[10px] text-slate-300 mt-1">
                Généré le {new Date().toLocaleString('fr-FR')} par {data.agent?.nom}
             </p>
          </div>
        </div>
      </div>
    );
  }
);

ReceiptTemplate.displayName = 'ReceiptTemplate';
