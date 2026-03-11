import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { isManagedSettingKey, NON_PREFIX_MANAGED_SETTING_KEYS } from '../src/lib/settings-backup.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

function walkJsFiles(dirPath) {
    const out = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'coverage') continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(fullPath);
        }
    }
    return out;
}

function getRuntimeJsFiles() {
    return [
        ...walkJsFiles(path.join(repoRoot, 'src')),
        ...fs.readdirSync(repoRoot)
            .filter((name) => /^(cpm-.*|provider-manager)\.js$/i.test(name))
            .map((name) => path.join(repoRoot, name)),
    ];
}

function extractQuotedStrings(text) {
    return [...text.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] ?? match[2]);
}

function collectPluginStorageKeys(content) {
    const keys = new Set();

    for (const match of content.matchAll(/pluginStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)) {
        keys.add(match[1]);
    }

    const keyAssignments = new Map();
    for (const match of content.matchAll(/(?:const|let|var)\s+([A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]|([A-Za-z0-9_]+KEY)\s*:\s*['"]([^'"]+)['"]/g)) {
        const identifier = match[1] ?? match[3];
        const value = match[2] ?? match[4];
        if (identifier && value) keyAssignments.set(identifier, value);
    }

    for (const match of content.matchAll(/pluginStorage\.(?:getItem|setItem|removeItem)\(\s*(?:this\.)?([A-Za-z0-9_]+)\s*(?:,|\))/g)) {
        const resolved = keyAssignments.get(match[1]);
        if (resolved) keys.add(resolved);
    }

    const pluginStorageListBlock = content.match(/_PLUGIN_STORAGE_KEYS\s*:\s*\[([\s\S]*?)\]/);
    if (pluginStorageListBlock) {
        for (const key of extractQuotedStrings(pluginStorageListBlock[1])) {
            keys.add(key);
        }
    }

    return [...keys];
}

function collectExportKeys(content) {
    const keys = [];
    const constantMap = new Map(
        [...content.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g)]
            .map((match) => [match[1], match[2]])
    );

    for (const match of content.matchAll(/exportKeys\s*:\s*\[([\s\S]*?)\]/g)) {
        const block = match[1];
        keys.push(...extractQuotedStrings(block));

        for (const identifierMatch of block.matchAll(/\b([A-Z0-9_]+)\b/g)) {
            const resolved = constantMap.get(identifierMatch[1]);
            if (resolved) keys.push(resolved);
        }
    }
    return keys;
}

describe('Purge ownership policy', () => {
    it('uses only CPM-prefixed pluginStorage keys across CPM code', () => {
        const jsFiles = getRuntimeJsFiles();
        const storageFiles = jsFiles.filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('pluginStorage.'));

        for (const filePath of storageFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            const keys = collectPluginStorageKeys(content);
            for (const key of keys) {
                expect(key, `${path.relative(repoRoot, filePath)} uses non-CPM storage key ${key}`).toMatch(/^cpm[_-]/);
            }
        }
    });

    it('restricts every sub-plugin export key to the CPM-managed set', () => {
        const subPluginFiles = fs.readdirSync(repoRoot)
            .filter((name) => /^cpm-.*\.js$/i.test(name))
            .map((name) => path.join(repoRoot, name));

        for (const filePath of subPluginFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            const exportKeys = collectExportKeys(content);
            for (const key of exportKeys) {
                expect(isManagedSettingKey(key), `${path.basename(filePath)} exposes non-managed export key ${key}`).toBe(true);
            }
        }
    });

    it('keeps non-prefixed managed keys on an explicit allowlist only', () => {
        const subPluginFiles = fs.readdirSync(repoRoot)
            .filter((name) => /^cpm-.*\.js$/i.test(name))
            .map((name) => path.join(repoRoot, name));

        const nonPrefixedExportKeys = new Set();
        for (const filePath of subPluginFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            for (const key of collectExportKeys(content)) {
                if (!/^cpm[_-]/.test(key)) nonPrefixedExportKeys.add(key);
            }
        }

        expect([...nonPrefixedExportKeys].sort()).toEqual([
            'chat_claude_caching',
            'chat_gemini_preserveSystem',
            'chat_gemini_showThoughtsToken',
            'chat_gemini_usePlainFetch',
            'chat_gemini_useThoughtSignature',
            'chat_vertex_preserveSystem',
            'chat_vertex_showThoughtsToken',
            'chat_vertex_useThoughtSignature',
            'common_openai_servicetier',
            'tools_githubCopilotToken',
        ]);
        for (const key of nonPrefixedExportKeys) {
            expect(NON_PREFIX_MANAGED_SETTING_KEYS).toContain(key);
        }
    });

    it('every sub-plugin CPM.setArg key is covered by getManagedSettingKeys (no residue)', () => {
        const subPluginFiles = fs.readdirSync(repoRoot)
            .filter((name) => /^cpm-.*\.js$/i.test(name))
            .map((name) => path.join(repoRoot, name));

        const { getManagedSettingKeys } = require('../src/lib/settings-backup.js');
        const managedKeys = new Set(getManagedSettingKeys([]));

        for (const filePath of subPluginFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            // Find CPM.setArg('key', ...) or setArg('key', ...)
            for (const match of content.matchAll(/(?:CPM|api)\.setArg\(\s*['"]([^'"]+)['"]/g)) {
                const key = match[1];
                expect(managedKeys.has(key) || isManagedSettingKey(key),
                    `${path.basename(filePath)} writes arg '${key}' which is NOT in managedSettingKeys`).toBe(true);
            }
            // Find constant-based setArg: CPM.setArg(SOME_CONST, ...)
            const constants = new Map(
                [...content.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g)]
                    .map((m) => [m[1], m[2]])
            );
            for (const match of content.matchAll(/(?:CPM|api)\.setArg\(\s*([A-Z0-9_]+)\s*,/g)) {
                const resolved = constants.get(match[1]);
                if (resolved) {
                    expect(managedKeys.has(resolved) || isManagedSettingKey(resolved),
                        `${path.basename(filePath)} writes arg via ${match[1]}='${resolved}' which is NOT in managedSettingKeys`).toBe(true);
                }
            }
        }
    });

    it('every sub-plugin pluginStorage key starts with cpm_ or cpm- (no namespace pollution)', () => {
        const subPluginFiles = fs.readdirSync(repoRoot)
            .filter((name) => /^cpm-.*\.js$/i.test(name))
            .map((name) => path.join(repoRoot, name));

        for (const filePath of subPluginFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            const keys = collectPluginStorageKeys(content);
            for (const key of keys) {
                expect(key, `${path.basename(filePath)} uses non-CPM pluginStorage key '${key}'`).toMatch(/^cpm[_-]/);
            }
        }
    });

    it('window globals set by CPM all use _cpm, CupcakePM, or CPM_ prefix', () => {
        const jsFiles = getRuntimeJsFiles();

        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            // Match window.IDENTIFIER = or globalThis.IDENTIFIER =
            for (const match of content.matchAll(/(?:window|globalThis)\s*\.\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g)) {
                const name = match[1];
                // Skip known safe patterns: standard DOM/browser properties
                if (['addEventListener', 'removeEventListener', 'CupcakePM_SubPlugins', 'FileReader'].includes(name)) continue;
                // Must be a CPM-namespaced global
                const isCpmGlobal = /^(_cpm|__cpm|CupcakePM|CPM_|cpm)/i.test(name);
                expect(isCpmGlobal, `${path.relative(repoRoot, filePath)} sets non-CPM window.${name}`).toBe(true);
            }
        }
    });
});