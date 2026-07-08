import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) return collectSourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry) ? [absolute] : [];
  });
}

function importedSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from\s+|import\s*\()["']([^"']+)["']/g)].map(match => match[1]);
}

describe("frontières des workspaces", () => {
  const areas = [
    { directory: join(ROOT, "apps/web/src"), forbidden: ["apps/api", "@microflex/api"] },
    { directory: join(ROOT, "apps/api"), forbidden: ["apps/web", "@microflex/web"] },
    {
      directory: join(ROOT, "packages/shared"),
      forbidden: ["apps/web", "apps/api", "@microflex/web", "@microflex/api", "express"],
    },
  ];

  it.each(areas)("empêche les dépendances interdites depuis $directory", ({ directory, forbidden }) => {
    const violations = collectSourceFiles(directory).flatMap(file =>
      importedSpecifiers(file)
        .filter(specifier => forbidden.some(prefix => specifier.includes(prefix)))
        .map(specifier => `${relative(ROOT, file)} -> ${specifier}`),
    );

    expect(violations).toEqual([]);
  });

  it("interdit les anciens alias physiques dans le nouveau code", () => {
    const files = [
      ...collectSourceFiles(join(ROOT, "apps")),
      ...collectSourceFiles(join(ROOT, "packages")),
    ];
    const violations = files.flatMap(file =>
      importedSpecifiers(file)
        .filter(specifier => /^(?:client|server|shared)\//.test(specifier))
        .map(specifier => `${relative(ROOT, file)} -> ${specifier}`),
    );

    expect(violations).toEqual([]);
  });
});
