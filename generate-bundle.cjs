/**
 * Generate update-bundle.json from versions.json + individual sub-plugin files.
 * Run: node generate-bundle.cjs
 * 
 * Produces a SINGLE JSON file containing both version manifest AND all code.
 * This avoids proxy2 per-domain caching issues: only ONE fetch needed.
 * 
 * Structure: { versions: { name → {version, file, sha256} }, code: { file → code } }
 * 
 * This file is .gitignored (*.cjs) — it's a local build tool.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const versionsPath = path.join(__dirname, 'versions.json');
const outputPath = path.join(__dirname, 'update-bundle.json');
const legacyPath = path.join(__dirname, 'code-bundle.json');

const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));
const code = {};

for (const [name, info] of Object.entries(versions)) {
    const filePath = path.join(__dirname, info.file);
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  File not found: ${info.file} (${name}) — skipping`);
        continue;
    }
    const src = fs.readFileSync(filePath, 'utf-8');
    code[info.file] = src;

    // Compute SHA-256 integrity hash and embed in version manifest
    const hash = crypto.createHash('sha256').update(src, 'utf-8').digest('hex');
    info.sha256 = hash;

    console.log(`✅ ${info.file} (${(src.length / 1024).toFixed(1)}KB) — v${info.version} [sha256:${hash.substring(0, 12)}…]`);
}

const bundle = { versions, code };
fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 0), 'utf-8');
const size = (fs.statSync(outputPath).size / 1024).toFixed(1);
console.log(`\n📦 update-bundle.json generated: ${size}KB (${Object.keys(code).length} files)`);

// Clean up legacy file if present
if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
    console.log(`🗑️  Removed legacy code-bundle.json`);
}
