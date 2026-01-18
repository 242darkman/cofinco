
import { db } from "../server/db";
import { sessionsCaisse, users, caisseAssignations } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import WebSocket from "ws";

const BASE_URL = "http://localhost:5000";
let cookie = "";
let userId = "";

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
  
  // Extract cofin_sess or __Host-cofin_sess
  cookie = setCookie.split(';')[0];
  const body = await res.json();
  userId = body.user.id;
  console.log("✅ Logged in. UserId:", userId, "Cookie:", cookie);
}

async function openSession() {
  console.log("👉 Opening Caisse Session...");
  // Check if open session exists
  const existing = await db.select().from(sessionsCaisse).where(and(eq(sessionsCaisse.caissierId, userId), isNull(sessionsCaisse.closedAt)));
  if (existing.length > 0) {
      console.log("⚠️  Session already open, using it.");
      return;
  }

  // Fetch assigned caisse directly from DB
  const [assignment] = await db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));
  
  if (!assignment) {
      // Fallback: get any closed caisse session for this user to find their caisse, or just the first caisse
      const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.caissierId, userId)).limit(1);
      if (session) {
          console.log("Found caisse via past session:", session.caisseId);
          await openSessionWithId(session.caisseId);
          return;
      }
      throw new Error("No assigned caisse found for user in DB");
  }
  
  await openSessionWithId(assignment.caisseId);
}

async function openSessionWithId(caisseId: string) {
  const openRes = await fetch(`${BASE_URL}/api/sessions-caisse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ caisseId, soldeInitial: "0" }),
  });
  
  if (!openRes.ok) {
      const txt = await openRes.text();
      console.error("Failed to open session:", txt);
      throw new Error("Failed to open session");
  }
  console.log("✅ Session Opened/Verified.");
}

async function checkStatus(expected: 'CONNECTED' | 'DISCONNECTED') {
  console.log(`👉 Checking status in DB (Expected: ${expected})...`);
  // Delay slightly for async DB update
  await new Promise(r => setTimeout(r, 1000));
  
  const [session] = await db.select().from(sessionsCaisse).where(and(eq(sessionsCaisse.caissierId, userId), isNull(sessionsCaisse.closedAt)));
  if (!session) throw new Error("No active session found in DB");
  
  console.log("Current Status:", session.connectionStatus);
  if (session.connectionStatus !== expected) {
      throw new Error(`Status mismatch! Expected ${expected}, got ${session.connectionStatus}`);
  }
  console.log("✅ Status Verified.");
}

async function run() {
  try {
    await login();
    await openSession();
    
    // 1. Test Connection
    console.log("👉 Connecting WebSocket...");
    const ws = new WebSocket(`${BASE_URL.replace("http", "ws")}/ws`, {
        headers: { Cookie: cookie }
    });

    await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
            console.log("✅ WebSocket Connected!");
            resolve();
        });
        ws.on('error', reject);
    });

    // 2. Verify Connected Status
    await checkStatus('CONNECTED');

    // 3. Test Disconnect
    console.log("👉 Closing WebSocket...");
    ws.close();
    
    await new Promise<void>(resolve => setTimeout(resolve, 1000)); // Wait for close event handling
    
    // 4. Verify Disconnected Status
    await checkStatus('DISCONNECTED');

    console.log("\n🎉 ALL TESTS PASSED!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  }
}

run();
