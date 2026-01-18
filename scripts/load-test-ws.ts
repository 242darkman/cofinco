
import { db } from "../server/db";
import { sessionsCaisse, caisseAssignations } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import WebSocket from "ws";

const BASE_URL = "http://localhost:5000";
let cookie = "";
let userId = "";

const CONCURRENT_CLIENTS = 50;
const sockets: WebSocket[] = [];

async function login() {
  console.log("👉 Logging in...");
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "s.administrateur", password: "password123" }),
  });

  if (!res.ok) throw new Error("Login failed");
  
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("No cookie received");
  
  cookie = setCookie.split(';')[0];
  const body = await res.json();
  userId = body.user.id;
  console.log("✅ Logged in. UserId:", userId);
}

async function getAssignedCaisseId() {
    const [assignment] = await db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));
    return assignment?.caisseId;
}

async function openSession() {
  console.log("👉 Opening Caisse Session...");
  
  // Find caisse
  let caisseId = await getAssignedCaisseId();
  if(!caisseId) {
       // Fallback for demo logic if no direct assignment, grab from any session
       const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.caissierId, userId)).limit(1);
       caisseId = session?.caisseId;
  }
  
  if(!caisseId) throw new Error("No caisse found for user");

  // Check if session exists
  const existing = await db.select().from(sessionsCaisse).where(and(eq(sessionsCaisse.caissierId, userId), isNull(sessionsCaisse.closedAt)));
  if (existing.length > 0) {
      console.log("⚠️  Session already open, using it.");
      return;
  }

  const openRes = await fetch(`${BASE_URL}/api/sessions-caisse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ caisseId, soldeInitial: "0" }),
  });
  
  if (!openRes.ok) {
     console.log("Failed to open session (might be open already):", await openRes.text());
  } else {
     console.log("✅ Session Opened/Verified.");
  }
}

async function checkStatus(expected: 'CONNECTED' | 'DISCONNECTED') {
  const [session] = await db.select().from(sessionsCaisse).where(and(eq(sessionsCaisse.caissierId, userId), isNull(sessionsCaisse.closedAt)));
  if (!session) throw new Error("No active session found in DB");
  
  console.log(`[DB Check] Status: ${session.connectionStatus} (Expected: ${expected})`);
  if (session.connectionStatus !== expected) {
      throw new Error(`Status mismatch! Expected ${expected}, got ${session.connectionStatus}`);
  }
}

async function spawnClient(idx: number): Promise<WebSocket> {
    const ws = new WebSocket(`${BASE_URL.replace("http", "ws")}/ws`, {
        headers: { Cookie: cookie }
    });
    
    return new Promise((resolve, reject) => {
        ws.on('open', () => resolve(ws));
        ws.on('error', (err) => {
            // console.error(`Client ${idx} failed:`, err.message);
            reject(err);
        });
    });
}

async function run() {
  try {
    await login();
    await openSession();
    
    console.log(`🚀 Spawning ${CONCURRENT_CLIENTS} concurrent connections...`);
    
    for(let i=0; i<CONCURRENT_CLIENTS; i++) {
        try {
            const ws = await spawnClient(i);
            sockets.push(ws);
            if(i % 10 === 0) console.log(`   Spawned ${i+1}/${CONCURRENT_CLIENTS}`);
        } catch(e) {
            console.error(`Failed to spawn client ${i}`);
        }
    }
    console.log(`✅ All ${sockets.length} clients connected.`);
    
    // Check status - should be CONNECTED
    await checkStatus('CONNECTED');
    
    // Disconnect half
    console.log("✂️  Disconnecting 50% of clients...");
    const half = Math.floor(sockets.length / 2);
    for(let i=0; i<half; i++) {
        sockets[i].close();
    }
    
    await new Promise(r => setTimeout(r, 2000));
    // Status should STILL be CONNECTED because half are active
    await checkStatus('CONNECTED');
    
    console.log("✂️  Disconnecting remaining clients...");
    for(let i=half; i<sockets.length; i++) {
        sockets[i].close();
    }
    
    await new Promise(r => setTimeout(r, 2000));
    // Now it should be DISCONNECTED
    await checkStatus('DISCONNECTED');

    console.log("\n🎉 LOAD TEST & LOGIC PASSED!");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ LOAD TEST FAILED:", error);
    process.exit(1);
  }
}

run();
