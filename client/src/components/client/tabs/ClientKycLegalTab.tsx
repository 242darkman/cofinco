import React from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { Shield, FileText, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Card } from '../../ui';
import { InfoRow, KycBadge, RiskBadge, ExpirationBadge, ConsentBadge } from '../shared/ClientBadges';
import { TYPE_PIECE_LABELS, STATUT_VERIFICATION_PIECE_LABELS } from '@shared/enum/status-constants';
import { iso2ToFlag } from '../../../lib/format';

interface ClientKycLegalTabProps {
  client: ClientWithIdentity;
}

export default function ClientKycLegalTab({ client }: ClientKycLegalTabProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* Piece d'identite */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-status-warning/20 to-accent/20 rounded-lg">
              <FileText size={16} className="text-status-warning" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Piece d'Identite</h3>
          </div>

          {/* Document table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-subtle">
                  <th className="text-left text-[10px] text-content-muted uppercase tracking-wide py-2 px-3">Type</th>
                  <th className="text-left text-[10px] text-content-muted uppercase tracking-wide py-2 px-3">Numero</th>
                  <th className="text-left text-[10px] text-content-muted uppercase tracking-wide py-2 px-3">Pays d'emission</th>
                  <th className="text-left text-[10px] text-content-muted uppercase tracking-wide py-2 px-3">Expiration</th>
                  <th className="text-left text-[10px] text-content-muted uppercase tracking-wide py-2 px-3">Verification</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-edge-subtle/50 hover:bg-surface-subtle/30 transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-medium text-content-primary">
                      {client.typePiece ? (TYPE_PIECE_LABELS as any)[client.typePiece] || client.typePiece : '-'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-mono text-content-secondary text-xs">{client.numeroPiece || '-'}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-content-secondary">
                      {client.paysEmissionNom
                        ? `${iso2ToFlag(client.paysEmissionIso2)} ${client.paysEmissionNom}`.trim()
                        : '-'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <ExpirationBadge date={client.dateExpirationPiece} />
                  </td>
                  <td className="py-3 px-3">
                    {client.statutVerificationPiece ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        client.statutVerificationPiece === 'VERIFIED'
                          ? 'bg-status-success-bg text-status-success border-status-success/20'
                          : client.statutVerificationPiece === 'REJECTED'
                            ? 'bg-status-danger-bg text-status-danger border-status-danger/20'
                            : 'bg-status-info-bg text-status-info border-status-info/20'
                      }`}>
                        {(STATUT_VERIFICATION_PIECE_LABELS as any)[client.statutVerificationPiece] || client.statutVerificationPiece}
                      </span>
                    ) : (
                      <span className="text-content-muted">-</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Conformite & Compliance */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-accent/20 to-status-info/20 rounded-lg">
                <Shield size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Conformite</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                <span className="text-[10px] text-content-muted uppercase tracking-wide">Statut KYC</span>
                <KycBadge status={client.kycStatus} />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                <span className="text-[10px] text-content-muted uppercase tracking-wide">Niveau de risque</span>
                <RiskBadge level={client.riskLevel} />
              </div>

              {/* PEP flag */}
              {client.isPep && (
                <div className="p-3 rounded-lg bg-status-warning-bg border border-status-warning/20 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-status-warning shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-status-warning">Personne Politiquement Exposee (PEP)</p>
                    {client.pepDetails && (
                      <p className="text-[10px] text-status-warning/80 mt-0.5">{client.pepDetails}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Blacklist flag */}
              {client.isBlacklisted && (
                <div className="p-3 rounded-lg bg-status-danger-bg border border-status-danger/20 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-status-danger shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-status-danger">Client sur liste noire</p>
                    {client.blacklistReason && (
                      <p className="text-[10px] text-status-danger/80 mt-0.5">{client.blacklistReason}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Consentement */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-status-success/20 to-accent/20 rounded-lg">
                <Shield size={16} className="text-status-success" />
              </div>
              <h3 className="text-sm font-bold text-content-primary tracking-tight">Consentement & Legal</h3>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                <p className="text-[10px] text-content-muted uppercase tracking-wide mb-2">Consentement donnees</p>
                <ConsentBadge consented={client.consentementDonnees} date={client.consentementDate} />
              </div>

              {client.kycVerifiedAt && (
                <InfoRow
                  label="KYC verifie le"
                  value={new Date(client.kycVerifiedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                />
              )}

              {client.kycExpiryDate && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
                  <span className="text-[10px] text-content-muted uppercase tracking-wide">Expiration KYC</span>
                  <ExpirationBadge date={client.kycExpiryDate} />
                </div>
              )}

              {client.kycNotes && (
                <InfoRow label="Notes KYC" value={client.kycNotes} />
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
