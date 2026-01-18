import React from 'react';
import { Building2, Phone, Mail, MapPin, Globe, FileText, Calendar, Hash, User, Briefcase } from 'lucide-react';
import { ReceiptData } from './ReceiptTemplate';

// Default Company Info
const DEFAULT_COMPANY_INFO = {
  nom: 'COFIN&CO',
  slogan: 'Microfinance & Services Financiers',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@cofinco-m.com',
  siteWeb: 'www.cofinco-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234'
};

interface InvoiceTemplateProps {
  data: ReceiptData;
  companyInfo?: typeof DEFAULT_COMPANY_INFO;
}

export const InvoiceTemplate = React.forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ data, companyInfo = DEFAULT_COMPANY_INFO }, ref) => {

    const formattedDate = new Date(data.date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const formattedTime = new Date(data.date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Determine if this is a debit transaction
    const isDebit = ['Retrait', 'Décaissement', 'Prêt', 'Versement'].some(
      type => data.type?.toLowerCase().includes(type.toLowerCase())
    );

    return (
      <div 
        data-receipt-root
        className="invoice-a4 bg-white" 
        ref={ref}
      >
        {/* Print specific styles for A4 */}
        <style type="text/css" media="print">
          {`
            @page {
              size: A4;
              margin: 15mm;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print { display: none !important; }
              .print-break { page-break-before: always; }
            }
          `}
        </style>

        <div className="w-full max-w-[210mm] mx-auto min-h-[297mm] bg-white font-sans text-slate-900 flex flex-col p-0">

          {/* ===== HEADER SECTION ===== */}
          <header className="relative">
            {/* Top Color Bar */}
            <div className="h-2 bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500" />

            <div className="px-8 py-6 flex justify-between items-start">
              {/* Company Info - Left */}
              <div className="flex items-start gap-4">
                {/* Logo */}
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-black text-xl tracking-tight">CO</span>
                </div>

                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    {companyInfo.nom}
                  </h1>
                  <p className="text-sm text-slate-500 font-medium">{companyInfo.slogan}</p>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p className="flex items-center gap-2">
                      <MapPin size={11} className="text-slate-400" />
                      {companyInfo.adresse}
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone size={11} className="text-slate-400" />
                      {companyInfo.telephone}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail size={11} className="text-slate-400" />
                      {companyInfo.email}
                    </p>
                    <p className="flex items-center gap-2">
                      <Globe size={11} className="text-slate-400" />
                      {companyInfo.siteWeb}
                    </p>
                  </div>
                </div>
              </div>

              {/* Invoice Title & Reference - Right */}
              <div className="text-right">
                <div className="inline-block">
                  <h2 className={`
                    text-4xl font-black uppercase tracking-wide
                    ${isDebit ? 'text-amber-600' : 'text-emerald-600'}
                  `}>
                    {isDebit ? 'Reçu' : 'Facture'}
                  </h2>
                  <div className={`h-1 mt-1 rounded-full ${isDebit ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-end gap-2">
                    <Hash size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-500 uppercase">Référence</span>
                  </div>
                  <p className="font-mono text-lg font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg inline-block">
                    {data.reference}
                  </p>

                  <div className="flex items-center justify-end gap-2 mt-3">
                    <Calendar size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-500">
                      {formattedDate} à {formattedTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* ===== CLIENT & OPERATION INFO ===== */}
          <div className="px-8 py-6 grid grid-cols-2 gap-8 bg-slate-50 border-y border-slate-200">
            {/* Client Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <User size={14} className="text-blue-600" />
                </div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Informations Client
                </h3>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-lg font-bold text-slate-900 mb-1">
                  {data.client?.prenom} {data.client?.nom}
                </p>
                {data.client?.adresse && (
                  <p className="text-sm text-slate-600">{data.client.adresse}</p>
                )}
                {data.client?.telephone && (
                  <p className="text-sm text-slate-600 flex items-center gap-2 mt-1">
                    <Phone size={12} className="text-slate-400" />
                    {data.client.telephone}
                  </p>
                )}
                {data.client?.email && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <Mail size={12} className="text-slate-400" />
                    {data.client.email}
                  </p>
                )}
                {data.client?.numeroCompte && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase">N° Compte</span>
                    <p className="font-mono text-sm font-semibold text-slate-700">
                      {data.client.numeroCompte}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Operation Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <FileText size={14} className="text-emerald-600" />
                </div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Détails de l'Opération
                </h3>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200">
                  <span className="text-sm text-slate-500">Type d'opération</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                    isDebit ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {data.type}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200">
                  <span className="text-sm text-slate-500">Mode de paiement</span>
                  <span className="text-sm font-semibold text-slate-700">{data.modePaiement}</span>
                </div>

                {data.agent && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Agent traitant</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {data.agent.prenom} {data.agent.nom}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== ITEMS TABLE ===== */}
          <div className="px-8 py-6 flex-grow">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[55%]">
                    Description
                  </th>
                  <th className="py-3 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">
                    Qté
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">
                    P.U.
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr
                    key={index}
                    className={`border-b border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    <td className="py-4 px-4">
                      <p className="font-semibold text-slate-900">{item.description}</p>
                      {item.details && (
                        <p className="text-xs text-slate-500 mt-1">{item.details}</p>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center text-slate-600 font-mono">
                      {item.quantite || 1}
                    </td>
                    <td className="py-4 px-4 text-right text-slate-600 font-mono">
                      {item.quantite && item.quantite > 1
                        ? (item.montant / item.quantite).toLocaleString('fr-FR')
                        : item.montant.toLocaleString('fr-FR')
                      }
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-slate-900 font-mono">
                      {item.montant.toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== TOTALS SECTION ===== */}
          <div className="px-8 pb-6">
            <div className="flex justify-end">
              <div className="w-80">
                {/* Subtotal */}
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">Sous-total HT</span>
                  <span className="font-mono text-slate-700">
                    {(data.tax ? data.total - data.tax : data.total).toLocaleString('fr-FR')} {data.devise || 'FCFA'}
                  </span>
                </div>

                {/* Tax if applicable */}
                {data.tax && data.tax > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-sm text-slate-600">Taxes / TVA</span>
                    <span className="font-mono text-slate-700">
                      {data.tax.toLocaleString('fr-FR')} {data.devise || 'FCFA'}
                    </span>
                  </div>
                )}

                {/* Total */}
                <div className={`
                  flex justify-between items-center py-4 mt-2 rounded-xl px-4
                  ${isDebit
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                  }
                `}>
                  <span className="text-white font-bold uppercase text-sm">Total TTC</span>
                  <span className="text-2xl font-black text-white font-mono">
                    {data.total.toLocaleString('fr-FR')} <span className="text-sm font-normal opacity-80">{data.devise || 'FCFA'}</span>
                  </span>
                </div>

                {/* Amount in words */}
                {data.montantLettres && (
                  <p className="mt-3 text-xs text-slate-500 italic text-right">
                    Arrêté à la somme de : <span className="font-medium not-italic text-slate-700">{data.montantLettres}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ===== NOTES SECTION ===== */}
          {data.notes && (
            <div className="px-8 pb-6">
              <div className="p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">
                  Note importante
                </p>
                <p className="text-sm text-amber-900">{data.notes}</p>
              </div>
            </div>
          )}

          {/* ===== SIGNATURES ===== */}
          <div className="px-8 py-6 border-t border-slate-200">
            <div className="flex justify-between items-end">
              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-12">
                  Signature du Client
                </p>
                <div className="w-40 border-t-2 border-slate-300 pt-2">
                  <p className="text-xs text-slate-500">Date et signature</p>
                </div>
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-12">
                  Signature de l'Agent
                </p>
                <div className="w-40 border-t-2 border-slate-300 pt-2">
                  <p className="text-xs text-slate-500">Cachet et signature</p>
                </div>
              </div>
            </div>
          </div>

          {/* ===== FOOTER ===== */}
          <footer className="mt-auto">
            {/* Legal Info */}
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-200">
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <div className="flex gap-4">
                  <span>NIF: {companyInfo.nif}</span>
                  <span>RCCM: {companyInfo.rccm}</span>
                </div>
                <span>
                  Document généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Bottom Color Bar */}
            <div className="h-1.5 bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-600" />

            {/* Terms */}
            <div className="px-8 py-3 text-center">
              <p className="text-[9px] text-slate-400">
                Ce document tient lieu de facture. Conservez-le précieusement pour toute réclamation.
                Paiement immédiat à réception. Merci de votre confiance.
              </p>
            </div>
          </footer>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = 'InvoiceTemplate';
