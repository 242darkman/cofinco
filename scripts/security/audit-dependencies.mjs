import { spawnSync } from "node:child_process";

const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 };
const minimumSeverity = severityRank.high;

const exceptions = [
  {
    dependency: "xlsx",
    advisoryUrls: new Set([
      "https://github.com/advisories/GHSA-4r6h-8v6p-xvw6",
      "https://github.com/advisories/GHSA-5pgg-2g8v-p4x9",
    ]),
    expiresOn: "2026-08-07",
    trackingDocument: "docs/security/dependency-exceptions.md",
  },
];

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  console.error(`Impossible d'exécuter npm audit: ${result.error.message}`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("npm audit n'a pas renvoyé un rapport JSON exploitable.");
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const failures = [];
const accepted = [];

for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  if ((severityRank[vulnerability.severity] ?? 0) < minimumSeverity) continue;

  const advisories = vulnerability.via.filter((item) => typeof item === "object");
  const exception = exceptions.find(
    (candidate) =>
      candidate.dependency === vulnerability.name &&
      candidate.expiresOn >= today &&
      advisories.length > 0 &&
      advisories.every((advisory) => candidate.advisoryUrls.has(advisory.url)),
  );

  if (exception) {
    accepted.push({ vulnerability, exception });
  } else {
    failures.push(vulnerability);
  }
}

for (const { vulnerability, exception } of accepted) {
  console.warn(
    `EXCEPTION TEMPORAIRE: ${vulnerability.name} (${vulnerability.severity}), ` +
      `expiration ${exception.expiresOn}, suivi: ${exception.trackingDocument}`,
  );
}

if (failures.length > 0) {
  for (const vulnerability of failures) {
    console.error(
      `VULNERABILITE BLOQUANTE: ${vulnerability.name} (${vulnerability.severity}, ${vulnerability.range})`,
    );
  }
  process.exit(1);
}

console.log(
  `Audit accepté: aucune vulnérabilité haute ou critique hors exception (${accepted.length} exception(s)).`,
);
