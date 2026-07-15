import { describe, it, expect } from 'vitest';
import { buildPendingSummary } from '../../apps/api/services/sync-journal/sync-state-summary';

const base = {
  agentNom: 'NGOMA',
  agentPrenom: 'Pierre',
  lastHandshakeAt: null as Date | null,
  lastUploadAt: null as Date | null,
};

describe('Sync State — buildPendingSummary', () => {
  it('agrège total, nombre d’appareils et détail', () => {
    const summary = buildPendingSummary([
      { ...base, deviceId: 'd1', agentId: 'a1', pendingCount: 12, lastHandshakeAt: new Date('2026-07-15T08:00:00Z') },
      { ...base, deviceId: 'd2', agentId: 'a2', agentNom: 'OKEMBA', agentPrenom: null, pendingCount: 3, lastUploadAt: new Date('2026-07-15T09:00:00Z') },
    ]);

    expect(summary.totalPending).toBe(15);
    expect(summary.deviceCount).toBe(2);
    expect(summary.devices).toHaveLength(2);
    expect(summary.devices[0].agentNom).toBe('NGOMA Pierre');
    expect(summary.devices[1].agentNom).toBe('OKEMBA');
  });

  it('le rapport d’un appareil = le plus RÉCENT de handshake/upload ; l’agrégat garde le plus ANCIEN', () => {
    const summary = buildPendingSummary([
      {
        ...base, deviceId: 'd1', agentId: 'a1', pendingCount: 5,
        lastHandshakeAt: new Date('2026-07-15T08:00:00Z'),
        lastUploadAt: new Date('2026-07-15T10:00:00Z'),
      },
      {
        ...base, deviceId: 'd2', agentId: 'a2', pendingCount: 2,
        lastHandshakeAt: new Date('2026-07-13T06:00:00Z'),
      },
    ]);

    expect(summary.devices[0].reportedAt).toBe('2026-07-15T10:00:00.000Z');
    expect(summary.oldestReportAt).toBe('2026-07-13T06:00:00.000Z');
  });

  it('borne le détail à 10 appareils mais compte tout', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      ...base, deviceId: `d${i}`, agentId: `a${i}`, pendingCount: 1,
      lastHandshakeAt: new Date('2026-07-15T08:00:00Z'),
    }));
    const summary = buildPendingSummary(rows);

    expect(summary.totalPending).toBe(14);
    expect(summary.deviceCount).toBe(14);
    expect(summary.devices).toHaveLength(10);
  });

  it('gère l’absence de données et de jointure agent', () => {
    expect(buildPendingSummary([])).toEqual({
      totalPending: 0,
      deviceCount: 0,
      oldestReportAt: null,
      devices: [],
    });

    const summary = buildPendingSummary([
      { deviceId: 'd1', agentId: 'a1', agentNom: null, agentPrenom: null, pendingCount: 4, lastHandshakeAt: null, lastUploadAt: null },
    ]);
    expect(summary.devices[0].agentNom).toBeNull();
    expect(summary.devices[0].reportedAt).toBeNull();
    expect(summary.oldestReportAt).toBeNull();
  });
});
