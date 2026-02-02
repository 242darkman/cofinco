/**
 * momo-sandbox-e2e.mjs
 *
 * End-to-end MTN MoMo Sandbox (Collections RequestToPay):
 * - Uses existing API user credentials if provided (recommended)
 * - Otherwise provisions apiuser + apikey (requires CALLBACK_HOST)
 * - Gets Collections token
 * - Sends requestToPay with X-Callback-Url (optional but recommended)
 * - Polls status until final (SUCCESSFUL/FAILED/REJECTED) or timeout
 *
 * ENV (recommended):
 *   MOMO_SUBSCRIPTION_KEY=...
 *   MOMO_TARGET_ENV=sandbox
 *   MOMO_CALLBACK_HOST=https://kailee-fey-lillyana.ngrok-free.dev
 *   MTN_MOMO_CALLBACK_URL=https://kailee-fey-lillyana.ngrok-free.dev/api/webhooks/mtn
 *
 * If already provisioned:
 *   MTN_MOMO_API_USER_ID=...
 *   MTN_MOMO_API_KEY=...
 *
 * Usage:
 *   node --env-file=.env scripts/momo-sandbox-e2e.mjs                 # runs default test set
 *   node --env-file=.env scripts/momo-sandbox-e2e.mjs 56733123453     # runs single MSISDN
 */

import crypto from "crypto";

const BASE = "https://sandbox.momodeveloper.mtn.com";
const TARGET_ENV = process.env.MOMO_TARGET_ENV || "sandbox";

// --- ENV ---
const SUB_KEY = process.env.MOMO_SUBSCRIPTION_KEY || process.env.MTN_MOMO_SUBSCRIPTION_KEY || process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY;

const CALLBACK_HOST =
  process.env.MOMO_CALLBACK_HOST ||
  process.env.MTN_MOMO_CALLBACK_HOST ||
  process.env.MTN_MOMO_CALLBACK_HOST_URL ||
  "";

const CALLBACK_URL =
  process.env.MTN_MOMO_CALLBACK_URL ||
  process.env.MOMO_CALLBACK_URL ||
  "";

const API_USER_ID = process.env.MTN_MOMO_API_USER_ID || process.env.MOMO_API_USER_ID || "";
const API_KEY = process.env.MTN_MOMO_API_KEY || process.env.MOMO_API_KEY || "";

if (!SUB_KEY) {
  throw new Error("Missing subscription key: set MOMO_SUBSCRIPTION_KEY (or MTN_MOMO_SUBSCRIPTION_KEY)");
}

if ((!API_USER_ID || !API_KEY) && !CALLBACK_HOST) {
  throw new Error(
    "Missing MOMO_CALLBACK_HOST (needed to provision apiuser) OR set MTN_MOMO_API_USER_ID + MTN_MOMO_API_KEY"
  );
}

// =============================================================================
// Helpers
// =============================================================================

const LINE = "━".repeat(68);
const THIN = "─".repeat(68);

function header(title) {
  console.log("");
  console.log(LINE);
  console.log(`  ${title}`);
  console.log(LINE);
}

function kv(label, value) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

function statusIcon(status) {
  const s = String(status || "").toUpperCase();
  if (s === "SUCCESSFUL") return "\x1b[32m✓\x1b[0m";
  if (s === "FAILED" || s === "REJECTED") return "\x1b[31m✗\x1b[0m";
  return "\x1b[33m…\x1b[0m";
}

function resultLine(label, value, color) {
  const colors = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", reset: "\x1b[0m" };
  const c = colors[color] || "";
  const r = colors.reset;
  console.log(`  ${label.padEnd(22)} ${c}${value}${r}`);
}

async function http(method, url, { headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "User-Agent": "MoMo-E2E-Test/1.0",
      "Accept": "application/json",
      ...headers,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // ignore non-json
    }
  }

  // Detect WAF/proxy HTML rejection pages (status 200 but HTML body)
  if (res.ok && text.includes("<html") && !json) {
    const err = new Error(`WAF/Proxy blocked request: ${method} ${url}`);
    err.details = { status: res.status, text: text.slice(0, 500) };
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText} on ${url}`);
    err.details = { status: res.status, text, json };
    throw err;
  }

  return { status: res.status, json, text };
}

function basicAuth(user, pass) {
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isFinalStatus(status) {
  const s = String(status || "").toUpperCase();
  return ["SUCCESSFUL", "FAILED", "REJECTED"].includes(s);
}

// =============================================================================
// Provisioning
// =============================================================================

async function createApiUser() {
  const userId = crypto.randomUUID();
  await http("POST", `${BASE}/v1_0/apiuser`, {
    headers: {
      "X-Reference-Id": userId,
      "Ocp-Apim-Subscription-Key": SUB_KEY,
    },
    body: { providerCallbackHost: CALLBACK_HOST },
  });
  return userId;
}

async function createApiKey(userId) {
  const { json } = await http("POST", `${BASE}/v1_0/apiuser/${userId}/apikey`, {
    headers: { "Ocp-Apim-Subscription-Key": SUB_KEY },
  });
  if (!json?.apiKey) throw new Error("No apiKey returned from /apikey");
  return json.apiKey;
}

// =============================================================================
// Token
// =============================================================================

async function getCollectionsToken(userId, apiKey) {
  const { json } = await http("POST", `${BASE}/collection/token/`, {
    headers: {
      "Ocp-Apim-Subscription-Key": SUB_KEY,
      Authorization: `Basic ${basicAuth(userId, apiKey)}`,
    },
  });
  if (!json?.access_token) throw new Error("No access_token returned");
  return json.access_token;
}

// =============================================================================
// Collections RequestToPay
// =============================================================================

async function requestToPay(accessToken, { amount, currency, externalId, msisdn }) {
  const referenceId = crypto.randomUUID();

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "X-Reference-Id": referenceId,
    "X-Target-Environment": TARGET_ENV,
    "Ocp-Apim-Subscription-Key": SUB_KEY,
  };

  if (CALLBACK_URL) headers["X-Callback-Url"] = CALLBACK_URL;

  await http("POST", `${BASE}/collection/v1_0/requesttopay`, {
    headers,
    body: {
      amount: String(amount),
      currency: String(currency),
      externalId: String(externalId),
      payer: { partyIdType: "MSISDN", partyId: String(msisdn) },
      payerMessage: `Sandbox test - ${externalId}`,
      payeeNote: "Sandbox test",
    },
  });

  return referenceId;
}

async function getRequestToPayStatus(accessToken, referenceId) {
  const url = `${BASE}/collection/v1_0/requesttopay/${referenceId}`;
  const reqHeaders = {
    "User-Agent": "MoMo-E2E-Test/1.0",
    "Accept": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Target-Environment": TARGET_ENV,
    "Ocp-Apim-Subscription-Key": SUB_KEY,
  };

  const res = await fetch(url, {
    method: "GET",
    headers: reqHeaders,
  });

  // 404 = sandbox hasn't processed the request yet, treat as pending
  if (res.status === 404) {
    return { status: "PENDING", _notReady: true };
  }

  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { /* ignore */ }
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText} on ${url}`);
    err.details = { status: res.status, text, json };
    throw err;
  }

  return json;
}

async function pollStatus(accessToken, referenceId, { intervalMs = 5000, maxTries = 12 } = {}) {
  // Delai initial: le sandbox a besoin d'un moment pour creer la ressource
  await sleep(2000);

  for (let i = 0; i < maxTries; i++) {
    const st = await getRequestToPayStatus(accessToken, referenceId);
    const status = st?.status;
    const icon = statusIcon(status);
    const label = st?._notReady ? "NOT_READY" : (status || "PENDING");

    console.log(`    ${icon} Poll ${String(i + 1).padStart(2)}/${maxTries}  status=${label}`);

    if (isFinalStatus(status)) return st;
    await sleep(intervalMs);
  }
  return null;
}

// =============================================================================
// Runner
// =============================================================================

async function runOne(accessToken, msisdn, expectedLabel, index, total) {
  const externalId = `intent_${crypto.randomUUID()}`;

  console.log("");
  console.log(THIN);
  console.log(`  TEST ${index}/${total} — MSISDN ${msisdn}`);
  console.log(THIN);

  kv("Resultat attendu:", expectedLabel);
  kv("External ID:", externalId);
  kv("Callback URL:", CALLBACK_URL || "(aucune)");
  console.log("");

  // Request to pay
  console.log("  Envoi requestToPay...");
  const t0 = Date.now();

  let referenceId;
  try {
    referenceId = await requestToPay(accessToken, {
      amount: 10,
      currency: "EUR",
      externalId,
      msisdn,
    });
  } catch (err) {
    resultLine("Statut:", `ERREUR - ${err.message}`, "red");
    if (err.details) {
      console.log(`  Details: ${JSON.stringify(err.details, null, 2).split("\n").join("\n  ")}`);
    }
    return { msisdn, expected: expectedLabel, actual: "ERROR", ok: false };
  }

  kv("Reference ID:", referenceId);
  console.log("");

  // Poll
  console.log("  Polling du statut...");
  const finalState = await pollStatus(accessToken, referenceId);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("");
  if (!finalState) {
    resultLine("Resultat:", `TIMEOUT (pas de statut final apres ${elapsed}s)`, "yellow");
    return { msisdn, expected: expectedLabel, actual: "TIMEOUT", ok: expectedLabel === "Timeout" || expectedLabel === "Pending" };
  }

  const actual = finalState.status;
  const reason = finalState.reason || "";
  const matchesExpected =
    (expectedLabel === "Success" && actual === "SUCCESSFUL") ||
    (expectedLabel === "Failed" && actual === "FAILED") ||
    (expectedLabel === "Rejected" && (actual === "REJECTED" || (actual === "FAILED" && reason === "APPROVAL_REJECTED"))) ||
    (expectedLabel === "Timeout" && (actual === "FAILED" && reason === "EXPIRED")) ||
    (expectedLabel === "Pending" && (actual === "SUCCESSFUL" || actual === "PENDING")) ||
    expectedLabel === "Single";

  const color = matchesExpected ? "green" : "red";
  resultLine("Resultat:", actual, color);
  kv("Duree:", `${elapsed}s`);

  if (finalState.reason) {
    kv("Raison:", finalState.reason);
  }
  if (finalState.financialTransactionId) {
    kv("Transaction ID:", finalState.financialTransactionId);
  }

  if (!matchesExpected && expectedLabel !== "Single") {
    resultLine("Attendu:", expectedLabel, "yellow");
  }

  return { msisdn, expected: expectedLabel, actual, ok: matchesExpected };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║          MTN MoMo Sandbox — Test E2E Collections                   ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  let userId = API_USER_ID;
  let apiKey = API_KEY;

  // --- Step 1: Credentials ---
  header("1. Credentials API");

  if (!userId || !apiKey) {
    console.log("  Aucun credential en env, provisionnement en cours...");
    kv("Callback Host:", CALLBACK_HOST);

    userId = await createApiUser();
    apiKey = await createApiKey(userId);

    resultLine("Statut:", "Nouveau API User provisionne", "green");
    kv("API User ID:", userId);
    kv("API Key:", apiKey);
    console.log("");
    console.log("  Sauvegardez ces valeurs dans .env pour les reutiliser.");
  } else {
    console.log("  > Variables MTN_MOMO_API_USER_ID et MTN_MOMO_API_KEY detectees.");
    console.log("  > Provisionnement saute (utilisation des credentials existants).");
    resultLine("Statut:", "Credentials existants (env)", "green");
    kv("API User ID:", userId);
    kv("API Key:", apiKey.slice(0, 8) + "****");
  }

  // --- Step 2: Token ---
  header("2. Obtention du token Collections");

  const token = await getCollectionsToken(userId, apiKey);
  resultLine("Statut:", "Token obtenu", "green");
  kv("Token:", token.slice(0, 20) + "...");

  // --- Step 3: Tests ---
  const singleMsisdn = process.argv[2];

  const tests = singleMsisdn
    ? [[singleMsisdn, "Single"]]
    : [
        ["46733123450", "Failed"],
        ["46733123451", "Rejected"],
        ["46733123452", "Timeout"],
        ["56733123453", "Success"],
        ["46733123454", "Pending"],
      ];

  header(`3. Execution des tests (${tests.length} MSISDN)`);

  kv("Montant:", "10 EUR");
  kv("Environnement:", TARGET_ENV);
  kv("Callback URL:", CALLBACK_URL || "(aucune)");

  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const [msisdn, expected] = tests[i];
    const result = await runOne(token, msisdn, expected, i + 1, tests.length);
    results.push(result);
  }

  // --- Step 4: Summary ---
  header("4. Recapitulatif");

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log("");
  for (const r of results) {
    const icon = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    const detail = r.expected === "Single"
      ? r.actual
      : `attendu=${r.expected} obtenu=${r.actual}`;
    console.log(`  ${icon}  MSISDN ${r.msisdn}  ${detail}`);
  }

  console.log("");
  console.log(THIN);

  if (failed === 0) {
    resultLine("Resultat global:", `${passed}/${results.length} OK`, "green");
  } else {
    resultLine("Resultat global:", `${passed}/${results.length} OK, ${failed} echoue(s)`, "red");
  }

  console.log(LINE);
  console.log("");
}

main().catch((e) => {
  console.error("");
  console.error(`\x1b[31m  ✗ ERREUR FATALE: ${e.message}\x1b[0m`);
  if (e.details) {
    console.error("  Details:", JSON.stringify(e.details, null, 2));
  }
  console.error("");
  process.exit(1);
});
