
import { db } from './server/db';
import { comptes, clients, agences } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function listPendingActivations() {
  console.log('Checking for accounts with status EN_ATTENTE_PAIEMENT...');

  const pendingAccounts = await db
    .select({
      id: comptes.id,
      numeroCompte: comptes.numeroCompte,
      statut: comptes.statut,
      agenceId: comptes.agenceId,
      agenceNom: agences.nom,
      clientId: clients.id,
      clientNom: clients.nom,
      clientAgenceId: clients.agenceId,
    })
    .from(comptes)
    .leftJoin(clients, eq(comptes.clientId, clients.id))
    .leftJoin(agences, eq(comptes.agenceId, agences.id))
    .where(eq(comptes.statut, 'EN_ATTENTE_PAIEMENT'));

  console.log(`Found ${pendingAccounts.length} pending accounts.`);
  
  if (pendingAccounts.length > 0) {
      console.table(pendingAccounts);
  } else {
      console.log("No pending accounts found. This explains why the list is empty.");
  }
  
  process.exit(0);
}

listPendingActivations().catch(console.error);
