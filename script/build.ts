import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = new Set([
  "connect-pg-simple",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "multer",
  "nodemailer",
  "pg",
  "uuid",
  "ws",
  "xlsx",
  "zod",
]);

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  // Agréger les dépendances de la racine et de chaque workspace :
  // depuis la répartition par app (npm workspaces), les deps du serveur
  // vivent dans apps/api et packages/shared, plus l'outillage racine.
  const manifests = [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "packages/shared/package.json",
  ];
  const allDeps = new Set<string>();
  for (const manifest of manifests) {
    const pkg = JSON.parse(await readFile(manifest, "utf-8"));
    for (const dep of Object.keys(pkg.dependencies || {})) allDeps.add(dep);
    for (const dep of Object.keys(pkg.devDependencies || {})) allDeps.add(dep);
  }
  const externals = Array.from(allDeps).filter((dep) => !allowlist.has(dep));

  await esbuild({
    entryPoints: ["apps/api/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

try {
  await buildAll();
} catch (err) {
  console.error(err);
  process.exit(1);
}
