#!/usr/bin/env node
/**
 * Repo sanity checks that do not need a browser, a Rust toolchain or network.
 * Run in CI before the build: `node scripts/validate-configs.mjs`.
 *
 * Catches the boring mistakes that otherwise only show up at packaging time on a
 * developer machine:
 *   - broken JSON in the Tauri config, package.json or a mod manifest
 *   - a mod listed in mods/index.json without a folder / entry file
 *   - a mod folder that exists but declares a different id
 *   - Tauri pointing at a frontend dist folder that does not exist after build
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const notes = [];

function readJson(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing file: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    errors.push(`invalid JSON in ${rel}: ${err.message}`);
    return null;
  }
}

// --- package.json ---------------------------------------------------------
const pkg = readJson("package.json");
if (pkg) {
  for (const script of ["dev", "build", "preview", "test", "desktop", "desktop:build"]) {
    if (!pkg.scripts?.[script]) errors.push(`package.json: missing script "${script}"`);
  }
  for (const dep of ["typescript", "vite", "@tauri-apps/cli"]) {
    if (!pkg.devDependencies?.[dep]) errors.push(`package.json: missing devDependency ${dep}`);
  }
  notes.push(`package: ${pkg.name}@${pkg.version}`);
}

// --- tauri config ---------------------------------------------------------
const tauri = readJson("src-tauri/tauri.conf.json");
if (tauri) {
  if (!tauri.identifier || !tauri.identifier.includes(".")) {
    errors.push("tauri.conf.json: identifier looks invalid");
  }
  const dist = tauri.build?.frontendDist;
  if (dist) {
    const distPath = resolve(root, "src-tauri", dist);
    if (!existsSync(distPath)) {
      notes.push(`frontendDist ${dist} not built yet (expected before npm run build)`);
    }
  } else {
    errors.push("tauri.conf.json: build.frontendDist missing");
  }
  if (!tauri.app?.windows?.length) errors.push("tauri.conf.json: no app window configured");
  notes.push(`tauri: ${tauri.productName} ${tauri.version}`);
}

for (const rel of ["src-tauri/Cargo.toml", "src-tauri/build.rs", "src-tauri/src/main.rs", "src-tauri/src/lib.rs"]) {
  if (!existsSync(join(root, rel))) errors.push(`missing native shell file: ${rel}`);
}

for (const rel of ["src-tauri/icons/icon.ico", "src-tauri/icons/icon.icns", "src-tauri/icons/32x32.png", "src-tauri/icons/128x128.png"]) {
  if (!existsSync(join(root, rel))) errors.push(`missing icon (run: npm run icons): ${rel}`);
}

// --- capabilitity file ----------------------------------------------------
const caps = readJson("src-tauri/capabilities/default.json");
if (caps && !Array.isArray(caps.permissions)) {
  errors.push("capabilities/default.json: permissions must be an array");
}

// --- mods -----------------------------------------------------------------
const modsIndex = readJson("public/mods/index.json");
const modsDir = join(root, "public/mods");
if (modsIndex) {
  if (!Array.isArray(modsIndex.mods)) {
    errors.push("public/mods/index.json: \"mods\" must be an array");
  } else {
    const seen = new Set();
    for (const mod of modsIndex.mods) {
      for (const field of ["id", "name", "version", "entry"]) {
        if (!mod[field]) errors.push(`mods/index.json: entry ${mod.id ?? "?"} missing "${field}"`);
      }
      if (seen.has(mod.id)) errors.push(`mods/index.json: duplicate mod id "${mod.id}"`);
      seen.add(mod.id);

      const folder = join(modsDir, mod.id ?? "");
      if (!existsSync(folder)) {
        errors.push(`mods/index.json: folder for "${mod.id}" does not exist`);
        continue;
      }
      const entry = join(folder, mod.entry ?? "");
      if (!existsSync(entry)) errors.push(`mod ${mod.id}: entry file "${mod.entry}" missing`);
      const manifestPath = join(folder, "mod.json");
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
          if (manifest.id !== mod.id) {
            errors.push(`mod ${mod.id}: mod.json declares id "${manifest.id}"`);
          }
          if (manifest.version !== mod.version) {
            notes.push(`mod ${mod.id}: mod.json version ${manifest.version} != index ${mod.version}`);
          }
        } catch (err) {
          errors.push(`mod ${mod.id}: invalid mod.json (${err.message})`);
        }
      } else {
        errors.push(`mod ${mod.id}: mod.json missing`);
      }
    }
    // folders without an index entry are fine (work in progress), just report
    for (const dir of readdirSync(modsDir, { withFileTypes: true })) {
      if (dir.isDirectory() && !seen.has(dir.name)) notes.push(`mod folder not indexed: ${dir.name}`);
    }
    notes.push(`mods: ${modsIndex.mods.length} indexed`);
  }
}

for (const line of notes) console.log(`info  ${line}`);
for (const line of errors) console.error(`error ${line}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) found`);
  process.exit(1);
}
console.log("\nconfigs OK");
