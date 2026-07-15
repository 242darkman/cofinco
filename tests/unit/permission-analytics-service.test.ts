import { describe, expect, it } from 'vitest';

import { toPermissionUsageLogInsert } from '../../apps/api/services/permission-analytics-mappers';

describe('permission analytics service', () => {
  it('convertit un log de permission en données Drizzle sans assembler de SQL', () => {
    const row = toPermissionUsageLogInsert({
      userId: '00000000-0000-0000-0000-000000000001',
      userRole: 'ADMIN',
      permissionCode: 'caisse.deposit',
      action: 'deposit',
      subject: 'Caisse',
      allowed: false,
      deniedReason: "Rôle non autorisé 'test'",
      endpoint: "/api/caisse/deposit?label='x'",
      ipAddress: '127.0.0.1',
    });

    expect(row.deniedReason).toBe("Rôle non autorisé 'test'");
    expect(row.endpoint).toBe("/api/caisse/deposit?label='x'");
    expect(row.agenceId).toBeNull();
    expect(row.resourceId).toBeNull();
    expect(row.ipAddress).toBe('127.0.0.1');
  });
});
