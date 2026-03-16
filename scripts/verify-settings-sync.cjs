#!/usr/bin/env node
'use strict';

/**
 * verify-settings-sync.cjs — Verify that every @arg declared in
 * src/plugin-header.js is covered by the managed-key lists in
 * src/lib/settings-backup.js.
 *
 * Exit 0 = OK, Exit 1 = mismatch found (prints exactly which keys are missing).
 *
 * Designed to run as part of the release pipeline (release.cjs) and
 * the pre-push Git hook, so that a forgotten key can NEVER reach production.
 *
 * Usage:
 *   node scripts/verify-settings-sync.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HEADER_PATH = path.join(ROOT, 'src', 'plugin-header.js');
const BACKUP_PATH = path.join(ROOT, 'src', 'lib', 'settings-backup.js');

// ── Step 1: Parse @arg keys from plugin-header.js ──
const headerSource = fs.readFileSync(HEADER_PATH, 'utf-8');
const headerArgKeys = [...headerSource.matchAll(/^\/\/@arg\s+([^\s]+)\s+/gm)]
    .map(m => m[1]);

if (headerArgKeys.length === 0) {
    console.error('[verify-settings-sync] FATAL: No @arg declarations found in plugin-header.js');
    process.exit(1);
}

// ── Step 2: Parse BASE_SETTING_KEYS array from settings-backup.js ──
const backupSource = fs.readFileSync(BACKUP_PATH, 'utf-8');

// Extract the contents of the BASE_SETTING_KEYS array literal
const arrayMatch = backupSource.match(/export\s+const\s+BASE_SETTING_KEYS\s*=\s*\[([\s\S]*?)\];/);
if (!arrayMatch) {
    console.error('[verify-settings-sync] FATAL: Could not parse BASE_SETTING_KEYS from settings-backup.js');
    process.exit(1);
}

const baseKeys = [...arrayMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

// Also extract NON_PREFIX_MANAGED_SETTING_KEYS
const nonPrefixMatch = backupSource.match(/export\s+const\s+NON_PREFIX_MANAGED_SETTING_KEYS\s*=\s*\[([\s\S]*?)\];/);
const nonPrefixKeys = nonPrefixMatch
    ? [...nonPrefixMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    : [];

// Aux slot keys are generated dynamically from AUX_SETTING_SLOTS
const slotsMatch = backupSource.match(/export\s+const\s+AUX_SETTING_SLOTS\s*=\s*\[([\s\S]*?)\];/);
const slots = slotsMatch
    ? [...slotsMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    : [];
const auxKeys = slots.flatMap(s => [
    `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
    `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
    `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`,
]);

// The full managed key set = aux keys + base keys + non-prefix keys (+ isManagedSettingKey prefix matching)
const allManagedKeys = new Set([...auxKeys, ...baseKeys, ...nonPrefixKeys]);

// ── Step 3: Check every @arg key is in the managed set or covered by prefix matching ──
const missing = [];
for (const key of headerArgKeys) {
    const coveredByPrefix = key.startsWith('cpm_') || key.startsWith('cpm-');
    const inExplicitList = allManagedKeys.has(key);

    // The key must be EITHER in the explicit managed set (BASE_SETTING_KEYS / AUX / NON_PREFIX)
    // OR covered by isManagedSettingKey's prefix check AND also explicitly in BASE_SETTING_KEYS.
    // We enforce that ALL @arg keys appear in the explicit lists to prevent backup gaps.
    if (!inExplicitList) {
        missing.push(key);
    }
}

// ── Step 4: Check for keys in BASE_SETTING_KEYS that are NOT in @arg (informational) ──
// Note: Some keys are managed programmatically by CPM's settings UI
// (e.g. cpm_enable_chat_resizer, cpm_fallback_*, cpm_show_token_usage)
// and intentionally have NO @arg declaration.  This is NOT an error.
const headerArgKeySet = new Set(headerArgKeys);
const nonArgKeys = baseKeys.filter(k => {
    // Slot keys won't appear as @arg (they're in AUX_SETTING_SLOTS instead)
    if (k.startsWith('cpm_slot_')) return false;
    // Keys that match NON_PREFIX list are shared with host
    if (nonPrefixKeys.includes(k)) return false;
    return !headerArgKeySet.has(k);
});

// ── Report ──
const errors = [];

if (missing.length > 0) {
    errors.push(
        `${missing.length} @arg key(s) declared in plugin-header.js but MISSING from settings-backup.js:`,
        ...missing.map(k => `  + '${k}'  →  Add to BASE_SETTING_KEYS in src/lib/settings-backup.js`),
    );
}

// Non-arg keys are informational only (NOT a failure)
if (nonArgKeys.length > 0) {
    console.log(`[verify-settings-sync] INFO: ${nonArgKeys.length} key(s) in BASE_SETTING_KEYS without @arg declaration (programmatic keys — expected):`);
    for (const k of nonArgKeys) console.log(`  · ${k}`);
}

if (errors.length > 0) {
    console.error('\n[verify-settings-sync] Settings key sync check FAILED:\n');
    for (const line of errors) console.error(line);
    console.error(`\nTotal @arg keys: ${headerArgKeys.length}, Managed keys: ${allManagedKeys.size}`);
    console.error('Fix the mismatches above and rerun.\n');
    process.exit(1);
}

console.log(`[verify-settings-sync] OK — ${headerArgKeys.length} @arg keys, all covered by settings-backup.js`);
