/**
 * E2E Test Fixtures — Shared test data helpers
 *
 * Since E2E tests run against an isolated `microflex_test` database
 * (created by db-init-test, truncated by global-setup), each test
 * suite only needs to insert its own test data in beforeAll.
 *
 * Cleanup is handled automatically by global-teardown (TRUNCATE CASCADE)
 * so afterAll cleanup is not needed.
 */

import { db } from '../../apps/api/db';
import { users, userRoles } from '../../packages/shared/schema/auth';
import { clients } from '../../packages/shared/schema/clients';
import { agences } from '../../packages/shared/schema/agences';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

export interface TestFixture {
  agenceId: string;
  agentId: string;
  supervisorId: string;
  caissierId: string;
  clientId: string;
  agentEmail: string;
  supervisorEmail: string;
  caissierEmail: string;
  clientNom: string;
  password: string;
}

/**
 * Creates a complete set of test entities (agence, users with hashed passwords,
 * user roles, client). Uses UUIDs + timestamps so multiple test suites can run
 * in parallel without conflicts. Returns IDs and credentials for use in tests.
 */
export async function createTestFixture(prefix = 'e2e'): Promise<TestFixture> {
  const ids = {
    agenceId: uuidv4(),
    agentId: uuidv4(),
    supervisorId: uuidv4(),
    caissierId: uuidv4(),
    clientId: uuidv4(),
  };

  const password = 'Test@1234';
  const hashedPassword = await bcrypt.hash(password, 10);
  const suffix = Date.now();

  const agentEmail = `agent-${prefix}-${suffix}@test.local`;
  const supervisorEmail = `supervisor-${prefix}-${suffix}@test.local`;
  const caissierEmail = `caissier-${prefix}-${suffix}@test.local`;
  const clientNom = `Client ${prefix}`;

  // Create test agency
  await db.insert(agences).values({
    id: ids.agenceId,
    nom: `Agence Test ${prefix}`,
    ville: 'Brazzaville',
    codeAgence: `AG-${prefix.toUpperCase()}-${suffix}`,
  } as any).onConflictDoNothing();

  // Create test users with hashed passwords
  await db.insert(users).values([
    {
      id: ids.supervisorId,
      nom: `Superviseur ${prefix}`,
      email: supervisorEmail,
      username: supervisorEmail,
      password: hashedPassword,
      role: 'superviseur',
      agenceId: ids.agenceId,
    },
    {
      id: ids.agentId,
      nom: `Agent ${prefix}`,
      email: agentEmail,
      username: agentEmail,
      password: hashedPassword,
      role: 'agent_terrain',
      agenceId: ids.agenceId,
    },
    {
      id: ids.caissierId,
      nom: `Caissier ${prefix}`,
      email: caissierEmail,
      username: caissierEmail,
      password: hashedPassword,
      role: 'caissier',
      agenceId: ids.agenceId,
    },
  ] as any).onConflictDoNothing();

  // Insert user roles (required for V3 auth)
  await db.insert(userRoles).values([
    { userId: ids.supervisorId, role: 'SUPERVISEUR' as any, isPrimary: true, agenceId: ids.agenceId },
    { userId: ids.agentId, role: 'AGENT_TERRAIN' as any, isPrimary: true, agenceId: ids.agenceId },
    { userId: ids.caissierId, role: 'CAISSIER' as any, isPrimary: true, agenceId: ids.agenceId },
  ]).onConflictDoNothing();

  // Create test client
  await db.insert(clients).values({
    id: ids.clientId,
    nom: clientNom,
    telephone: `+24206${suffix.toString().slice(-7)}`,
    email: `client-${prefix}-${suffix}@test.local`,
    numeroCompte: `CLT-${prefix.toUpperCase()}-${suffix}`,
    agenceId: ids.agenceId,
  } as any).onConflictDoNothing();

  return {
    ...ids,
    agentEmail,
    supervisorEmail,
    caissierEmail,
    clientNom,
    password,
  };
}
