import React from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { MapPin, Phone, Mail } from 'lucide-react';
import { formatClientName, formatPhoneNumber } from '../../../lib/format';
import { formatMoney } from '@shared/config/currency';

export interface EnqueteReportData {
  enquete: {
    id: string;
    statut: string;
    assignedAt?: string | null;
    startedAt?: string | null;
    submittedAt?: string | null;
    reviewedAt?: string | null;
    createdByName?: string | null;
    // Client situation
    situationMatrimoniale?: string | null;
    personnesCharge?: number | null;
    typeHabitation?: string | null;
    // Activity
    categorieActivite?: string | null;
    typeActivite?: string | null;
    ancienneteActivite?: number | null;
    evaluationActivite?: string | null;
    // Financials
    revenuMensuel?: string | number | null;
    revenuJournalier?: string | number | null;
    chargesMensuelles?: string | number | null;
    autresCredits?: any[] | null;
    capaciteRemboursement?: string | number | null;
    // Guarantees
    garantiesProposees?: any[] | null;
    documentsJustificatifs?: string[] | null;
    // Geo
    geoLatitude?: string | number | null;
    geoLongitude?: string | number | null;
    // Recommendation
    agentRecommendation?: string | null;
    recommendedAmount?: string | number | null;
    riskLevel?: string | null;
    riskFactors?: string[] | null;
    observations?: string | null;
    supervisorNotes?: string | null;
  };
  client: {
    nom: string;
    prenom?: string;
    telephone?: string;
    email?: string;
  };
  demande: {
    numeroDemande: string;
    montantDemande: number;
    objetCredit?: string;
    dureeValeur?: number;
    dureeUnite?: string;
    tauxInteret?: number;
    frequenceRemboursement?: string;
  };
  creditPlan?: {
    nom: string;
    montantMin?: string | null;
    montantMax?: string | null;
    collateralRequired?: boolean;
  } | null;
}

const DEFAULT_COMPANY_INFO = {
  nom: 'COFIN&CO',
  adresse: 'Brazzaville, République du Congo',
  telephone: '+242 06 123 4567',
  email: 'contact@cofinco-m.com',
  nif: 'NIF-123456789',
  rccm: 'RCCM-BZV-1234',
};

const recommendationLabels: Record<string, string> = {
  APPROVE: 'Favorable',
  APPROVE_WITH_CONDITIONS: 'Favorable sous conditions',
  REJECT: 'Défavorable',
};

const riskLabels: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyen',
  HIGH: 'Élevé',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', borderBottom: '2px solid #334155', paddingBottom: '4px', marginBottom: '8px', color: '#1e293b' }}>
      {children}
    </h3>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ color: '#64748b', fontSize: '11px' }}>{label}</span>
      <span style={{ color: '#1e293b', fontSize: '11px', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: fr });
  } catch {
    return d;
  }
}

export const EnqueteReportTemplate = React.forwardRef<HTMLDivElement, EnqueteReportData>(
  ({ enquete, client, demande, creditPlan }, ref) => {
    const { branding } = useBranding();
    const companyName = branding.appName || DEFAULT_COMPANY_INFO.nom;
    const e = enquete;
    const revenu = Number(e.revenuMensuel) || 0;
    const charges = Number(e.chargesMensuelles) || 0;
    const resteAVivre = revenu - charges;
    const garanties = (e.garantiesProposees as any[]) || [];

    return (
      <div className="hidden print:block font-sans bg-white text-[#1e293b]" ref={ref}>
        <style type="text/css" media="print">
          {`
            @page { size: A4; margin: 12mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          `}
        </style>

        <div style={{ maxWidth: '210mm', margin: '0 auto', padding: '16px', minHeight: '297mm', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', borderBottom: '3px solid #1e293b', paddingBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', background: '#3b82f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '16px' }}>
                  CO
                </div>
                <h1 style={{ fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>{companyName}</h1>
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.6 }}>
                <p><MapPin size={10} style={{ display: 'inline', marginRight: '4px' }} />{DEFAULT_COMPANY_INFO.adresse}</p>
                <p><Phone size={10} style={{ display: 'inline', marginRight: '4px' }} />{formatPhoneNumber(DEFAULT_COMPANY_INFO.telephone)}</p>
                <p><Mail size={10} style={{ display: 'inline', marginRight: '4px' }} />{DEFAULT_COMPANY_INFO.email}</p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '2px' }}>
                RAPPORT D'ENQUÊTE
              </h2>
              <p style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700 }}>#{demande.numeroDemande}</p>
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>Généré le {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          </div>

          {/* Client + Demande info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
              <SectionTitle>Client</SectionTitle>
              <InfoRow label="Nom" value={formatClientName(client.nom, client.prenom)} />
              <InfoRow label="Téléphone" value={formatPhoneNumber(client.telephone)} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow label="Situation" value={e.situationMatrimoniale} />
              <InfoRow label="Pers. à charge" value={e.personnesCharge != null ? String(e.personnesCharge) : null} />
              <InfoRow label="Habitation" value={e.typeHabitation} />
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
              <SectionTitle>Demande de Crédit</SectionTitle>
              <InfoRow label="Montant demandé" value={formatMoney(demande.montantDemande)} />
              <InfoRow label="Objet" value={demande.objetCredit} />
              <InfoRow label="Durée" value={demande.dureeValeur ? `${demande.dureeValeur} ${demande.dureeUnite || 'Mois'}` : null} />
              <InfoRow label="Taux" value={demande.tauxInteret ? `${demande.tauxInteret}%` : null} />
              <InfoRow label="Fréquence" value={demande.frequenceRemboursement} />
              {creditPlan && <InfoRow label="Plan crédit" value={creditPlan.nom} />}
            </div>
          </div>

          {/* Activity */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <SectionTitle>Activité Professionnelle</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              <InfoRow label="Catégorie" value={e.categorieActivite} />
              <InfoRow label="Type" value={e.typeActivite} />
              <InfoRow label="Ancienneté" value={e.ancienneteActivite ? `${e.ancienneteActivite} mois` : null} />
              <InfoRow label="Géolocalisation" value={e.geoLatitude ? `${Number(e.geoLatitude).toFixed(5)}, ${Number(e.geoLongitude).toFixed(5)}` : null} />
            </div>
            {e.evaluationActivite && (
              <p style={{ marginTop: '8px', fontSize: '11px', color: '#475569', fontStyle: 'italic', background: '#f8fafc', padding: '8px', borderRadius: '4px' }}>
                {e.evaluationActivite}
              </p>
            )}
          </div>

          {/* Financial analysis */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <SectionTitle>Analyse Financière</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div style={{ textAlign: 'center', background: '#f0fdf4', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Revenu mensuel</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a' }}>{formatMoney(revenu)}</div>
              </div>
              <div style={{ textAlign: 'center', background: '#fef2f2', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Charges mensuelles</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#dc2626' }}>{formatMoney(charges)}</div>
              </div>
              <div style={{ textAlign: 'center', background: '#eff6ff', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Reste à vivre</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: resteAVivre >= 0 ? '#2563eb' : '#dc2626' }}>{formatMoney(resteAVivre)}</div>
              </div>
            </div>
            {(e.autresCredits as any[])?.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Autres crédits en cours :</div>
                {(e.autresCredits as any[]).map((c: any, i: number) => (
                  <div key={i} style={{ fontSize: '10px', color: '#64748b', padding: '2px 0' }}>
                    • {c.organisme || 'Autre'} — {formatMoney(Number(c.montant) || 0)}/mois (échéance: {formatMoney(Number(c.echeance) || 0)})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guarantees */}
          {garanties.length > 0 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <SectionTitle>Garanties Proposées ({garanties.length})</SectionTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'left' }}>Type</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'left' }}>Description</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'right' }}>Valeur estimée</th>
                  </tr>
                </thead>
                <tbody>
                  {garanties.map((g: any, i: number) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px' }}>{g.type}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px' }}>{g.description || '—'}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'right' }}>{g.valeur ? formatMoney(Number(g.valeur)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Agent Recommendation */}
          <div style={{
            border: '2px solid',
            borderColor: e.agentRecommendation === 'APPROVE' ? '#16a34a' : e.agentRecommendation === 'REJECT' ? '#dc2626' : '#f59e0b',
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '16px',
            background: e.agentRecommendation === 'APPROVE' ? '#f0fdf4' : e.agentRecommendation === 'REJECT' ? '#fef2f2' : '#fffbeb',
          }}>
            <SectionTitle>Recommandation de l'Agent</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              <InfoRow label="Avis" value={e.agentRecommendation ? recommendationLabels[e.agentRecommendation] || e.agentRecommendation : '—'} />
              <InfoRow label="Montant recommandé" value={e.recommendedAmount ? formatMoney(Number(e.recommendedAmount)) : null} />
              <InfoRow label="Niveau de risque" value={e.riskLevel ? riskLabels[e.riskLevel] || e.riskLevel : null} />
              <InfoRow label="Agent enquêteur" value={e.createdByName || '—'} />
            </div>
            {e.riskFactors && e.riskFactors.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '10px', color: '#64748b' }}>
                <strong>Facteurs de risque :</strong> {e.riskFactors.join(', ')}
              </div>
            )}
            {e.observations && (
              <p style={{ marginTop: '8px', fontSize: '11px', color: '#475569', fontStyle: 'italic', background: 'rgba(255,255,255,0.6)', padding: '8px', borderRadius: '4px' }}>
                "{e.observations}"
              </p>
            )}
          </div>

          {/* Supervisor Notes */}
          {e.supervisorNotes && (
            <div style={{ border: '1px solid #6366f1', borderRadius: '8px', padding: '12px', marginBottom: '16px', background: '#eef2ff' }}>
              <SectionTitle>Notes du Superviseur</SectionTitle>
              <p style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>
                "{e.supervisorNotes}"
              </p>
            </div>
          )}

          {/* Timeline */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <SectionTitle>Chronologie</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', textAlign: 'center', fontSize: '10px' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Assignée</div>
                <div style={{ color: '#64748b' }}>{formatDate(e.assignedAt)}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Démarrée</div>
                <div style={{ color: '#64748b' }}>{formatDate(e.startedAt)}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Soumise</div>
                <div style={{ color: '#64748b' }}>{formatDate(e.submittedAt)}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Validée</div>
                <div style={{ color: '#64748b' }}>{formatDate(e.reviewedAt)}</div>
              </div>
            </div>
          </div>

          {/* Spacer + Footer */}
          <div style={{ flex: 1 }} />
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8' }}>
            <span>{companyName} — Rapport d'enquête crédit</span>
            <span>Document confidentiel — Usage interne uniquement</span>
          </div>
        </div>
      </div>
    );
  }
);

EnqueteReportTemplate.displayName = 'EnqueteReportTemplate';
