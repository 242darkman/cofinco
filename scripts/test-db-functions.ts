import { ensureCustomFunctions, closePool } from "../server/db";

async function main() {
  console.log("Starting ensureCustomFunctions test...");
  try {
    const start = Date.now();
    await ensureCustomFunctions();
    console.log(`ensureCustomFunctions completed successfully in ${Date.now() - start}ms`);
  } catch (error) {
    console.error("ensureCustomFunctions failed:", error);
  } finally {
    await closePool();
  }
}

main();
