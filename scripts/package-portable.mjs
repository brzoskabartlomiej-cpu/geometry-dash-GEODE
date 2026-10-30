#!/usr/bin/env node
/**
 * Builds the "portable ZIP": a version of the game that works by double-click,
 * with no server, no Node and no install.
 *
 * Why this exists: `dist/index.html` loads ES modules from separate files, and
 * browsers refuse to load modules from `file://` (CORS). So a plain zip of
 * dist/ is *not* playable by double-clicking. This script inlines the JS and CSS
 * into a single HTML file, then packs a zip with:
 *
 *   GeoDash.html     - double-click to play (no server needed)
 *   web/             - the normal build, served by server.mjs (mods work here)
 *   server.mjs       - dependency-free static server: `node server.mjs`
 *   START-HERE.txt   - instructions
 */
import { build } from "vite";
import { spawnSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const stageDir = join(releaseDir, "portable");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function log(message) {
  console.log(`[portable] ${message}`);
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push({ path: full, name: relative(base, full).replaceAll("\\", "/") });
  }
  return out;
}

// --- 1. build -------------------------------------------------------------
log("building with vite");
await build({ root, logLevel: "warn" });
if (!existsSync(join(distDir, "index.html"))) throw new Error("vite build produced no dist/index.html");

// --- 2. inline everything into one HTML -----------------------------------
const html = readFileSync(join(distDir, "index.html"), "utf8");
let inlineBytes = 0;

const inline = html
  .replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_m, href) => {
    const css = readFileSync(resolve(distDir, href.replace(/^\.?\//, "")), "utf8");
    inlineBytes += css.length;
    return `<style>\n${css}\n</style>`;
  })
  .replace(/<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g, (_m, before, src, after) => {
    const code = readFileSync(resolve(distDir, src.replace(/^\.?\//, "")), "utf8");
    inlineBytes += code.length;
    // an inline module script is allowed to run from file://, unlike an import
    return `<script${(before + after).includes("module") ? ' type="module"' : ""}>\n${code.replaceAll("</script", "<\\/script")}\n</script>`;
  })
  .replace(/<link[^>]*rel="modulepreload"[^>]*>/g, "");

const leftovers = [...inline.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
if (leftovers.length > 0) throw new Error(`assets are still referenced externally: ${leftovers.join(", ")}`);
if (/<script[^>]*src=/.test(inline)) throw new Error("an external script survived inlining");

const version = `v${pkg.version}`;
const singleFile = inline.replace("</title>", `</title>\n    <!-- Geo Dash ${version} - portable single file build -->`);

// --- 3. stage the zip contents -------------------------------------------
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

writeFileSync(join(stageDir, "GeoDash.html"), singleFile, "utf8");
log(`single file: GeoDash.html (${(singleFile.length / 1024).toFixed(1)} kB, inlined ${(inlineBytes / 1024).toFixed(1)} kB)`);

cpSync(distDir, join(stageDir, "web"), { recursive: true });
cpSync(join(root, "scripts", "server.mjs"), join(stageDir, "server.mjs"));

writeFileSync(
  join(stageDir, "START-HERE.txt"),
  `GEO DASH ${version} — portable build
=====================================

A) NAJSZYBSZY START (bez instalacji, bez serwera)
   1. Kliknij dwukrotnie GeoDash.html
   2. Gra otworzy się w przeglądarce i działa od razu.
   Uwaga: w tym trybie mody są wyłączone, bo przeglądarka blokuje
   wczytywanie plików z dysku (file://).

B) PELNA WERSJA Z MODAMI (bez instalacji, wymaga Node.js)
   1. Zainstaluj Node.js LTS: https://nodejs.org/en/download
   2. W tym folderze uruchom:   node server.mjs
   3. Otwórz:                   http://localhost:8080
   Mody z folderu web/mods dzialaja w tym trybie.

C) WGRANIE NA HOSTING (mody + gra dla wszystkich)
   Opublikuj zawartosc folderu web/ na dowolnym hostingu statycznym
   (GitHub Pages, Netlify, nginx). Gra dziala z podkatalogu.

STEROWANIE
   Space / W / strzalka w gore / Z / klik / tap = skok
   Przytrzymaj = skok po kazdym kontakcie z podlozem
   Esc / P = pauza

PROGRESS
   Postep (rekord, ukonczenie) zapisuje sie lokalnie w przegladarce
   (localStorage) - osobno dla kazdej przegladarki.

Geo Dash jest gra open source w stylu Geometry Dash. Nie wymaga Steam,
nie zawiera zadnych plikow ani assetow RobTop Games i nie laczy sie
z serwerami RobTopa.
Licencja kodu: MIT (patrz LICENSE w repozytorium).
`,
  "utf8",
);

writeFileSync(
  join(stageDir, "start-windows.cmd"),
  `@echo off
rem Full build with mod support (needs Node.js).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install it from https://nodejs.org/en/download and run this file again.
  echo Without Node.js you can still play by double-clicking GeoDash.html
  pause
  exit /b 1
)
start "" http://localhost:8080
node server.mjs
pause
`,
  "utf8",
);

writeFileSync(
  join(stageDir, "start-linux-macos.sh"),
  `#!/bin/sh
# Full build with mod support (needs Node.js).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed: https://nodejs.org/en/download"
  echo "Without Node.js play by opening GeoDash.html directly."
  exit 1
fi
echo "Open http://localhost:8080"
node server.mjs
`,
  "utf8",
);

// --- 4. zip ---------------------------------------------------------------
const { createZip } = await import("./zip.mjs");
const files = walk(stageDir).sort((a, b) => a.name.localeCompare(b.name));
const zip = createZip(files.map((f) => ({ name: `GeoDash-${version}/${f.name}`, data: readFileSync(f.path) })));
const zipPath = join(releaseDir, `GeoDash-${version}-portable.zip`);
writeFileSync(zipPath, zip);

const rawSize = files.reduce((sum, f) => sum + statSync(f.path).size, 0);
log(`zip: release/${relative(releaseDir, zipPath)}`);
log(`${files.length} files, ${(rawSize / 1024).toFixed(0)} kB raw -> ${(deflateRawSync(zip).length / 1024).toFixed(0)} kB`);
// --- 5. smoke test the single file so a broken build never ships ----------
if (!process.argv.includes("--no-verify")) {
  log("verifying the portable build (headless run of the inlined bundle)");
  const check = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(root, "scripts", "verify-portable.mjs")],
    { stdio: "inherit", cwd: root },
  );
  if (check.status !== 0) {
    throw new Error("portable build verification failed");
  }
}

log("done. Double-click GeoDash.html inside the zip to play.");
