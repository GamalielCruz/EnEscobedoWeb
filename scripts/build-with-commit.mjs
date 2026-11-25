#!/usr/bin/env node
/**
 * build-with-commit.mjs — `next build` con el hash del commit inyectado
 * (Fase 4-E). T7 se grabó con `build.commit='unknown'`; el hash debe quedar
 * inlineado en el cliente aunque el entorno de build no exponga las variables
 * de Vercel/CI.
 *
 * Orden: variables de la plataforma → `git rev-parse HEAD` → lectura directa
 * de `.git/HEAD` → "unknown" (con aviso).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function resolveCommit() {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_COMMIT ||
    process.env.SOURCE_VERSION ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.COMMIT_REF ||
    process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.trim();

  const git = spawnSync("git", ["rev-parse", "HEAD"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (git.status === 0) {
    const sha = git.stdout.toString().trim();
    if (/^[0-9a-f]{7,40}$/i.test(sha)) return sha;
  }

  const gitDir = path.join(process.cwd(), ".git");
  if (existsSync(gitDir)) {
    const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{7,40}$/i.test(head)) return head;
    const match = /^ref:\s*(.+)$/.exec(head);
    if (match) {
      const refFile = path.join(gitDir, match[1].trim());
      if (existsSync(refFile)) {
        const sha = readFileSync(refFile, "utf8").trim();
        if (/^[0-9a-f]{7,40}$/i.test(sha)) return sha;
      }
    }
  }

  console.warn(
    "[build] No se pudo resolver el hash del commit; build.commit será 'unknown'. " +
      "Define GIT_COMMIT_SHA en el entorno de build."
  );
  return "unknown";
}

const commit = resolveCommit();
console.log(`[build] commit ${commit}`);

/**
 * Fase 5-D: el hash se escribe como LITERAL en un módulo de fuente.
 *
 * `process.env.NEXT_PUBLIC_BUILD_COMMIT` no llega al cliente en este build:
 * webpack resuelve `process` al shim `process/browser` (env vacío), así que la
 * traza exportada seguía diciendo `build.commit:'unknown'`. El módulo se
 * reescribe antes de compilar y se restaura al terminar (incluso si falla).
 */
const generatedPath = path.join(process.cwd(), "lib/drive/build-commit.ts");
const previousSource = existsSync(generatedPath)
  ? readFileSync(generatedPath, "utf8")
  : null;
if (previousSource == null) {
  console.error("[build] Falta lib/drive/build-commit.ts");
  process.exit(1);
}
writeFileSync(
  generatedPath,
  previousSource.replace(
    /export const BUILD_COMMIT = "[^"]*";/,
    `export const BUILD_COMMIT = ${JSON.stringify(commit)};`
  )
);

const nextBin = require.resolve("next/dist/bin/next");
let result;
try {
  result = spawnSync(process.execPath, [nextBin, "build"], {
    stdio: "inherit",
    env: { ...process.env, GIT_COMMIT_SHA: commit },
  });
} finally {
  if (previousSource != null) writeFileSync(generatedPath, previousSource);
}

if (result?.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result?.status ?? 1);
