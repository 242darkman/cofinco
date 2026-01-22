
import { getAllAgentsTerrain } from "./server/storage/operations";

async function verify() {
  try {
    console.log("Fetching agents to verify names...");
    const agents = await getAllAgentsTerrain();
    
    console.log(`Found ${agents.length} agents.`);
    for (const agent of agents) {
      console.log(`Agent ID: ${agent.id}`);
      console.log(`  Nom: ${agent.nom}`);
      console.log(`  Prenom: ${agent.prenom}`);
      console.log(`  Zone: ${agent.zoneAffectation}`);
      console.log(`  Status: ${agent.statut}`);
    }

  } catch (err) {
    console.error("Verification failed:", err);
  } finally {
    process.exit(0);
  }
}

verify();
