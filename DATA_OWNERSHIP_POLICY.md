# CPM Data Ownership Policy

> Last updated: 2026-03-11

Purpose: `purgeAllCpmData()` must delete **only** data owned by Cupcake Provider Manager (CPM) and its CPM sub-plugins. Nothing else may be touched. No CPM residue may remain after purge.

---

## Ownership Rules

### 1. `pluginStorage` keys
CPM-owned `pluginStorage` keys must use one of these prefixes:
- `cpm_`
- `cpm-`

This is the hard boundary. The purge walks all pluginStorage keys and removes only those matching these prefixes.

Explicit known keys (declared in `_PLUGIN_STORAGE_KEYS`):
| Key | Writer |
|-----|--------|
| `cpm_installed_subplugins` | Sub-plugin registry |
| `cpm_settings_backup` | Settings backup |
| `cpm_last_version_check` | Sub-plugin update checker |
| `cpm_last_main_version_check` | Main plugin update checker |
| `cpm_last_boot_status` | Boot diagnostics |

Sub-plugin storage keys (caught by wildcard):
| Key | Writer |
|-----|--------|
| `cpm_transcache_corrections` | Translation cache sub-plugin |
| `cpm_transcache_timestamps` | Translation cache sub-plugin |

**Forbidden** for CPM code: unprefixed keys like `assets_index`, `dataset_cache`, etc.

### 2. Risu `@arg` settings
CPM-owned args must satisfy one of these rules:
- start with `cpm_` or `cpm-`
- be explicitly listed in `NON_PREFIX_MANAGED_SETTING_KEYS` allowlist

The allowlist (`NON_PREFIX_MANAGED_SETTING_KEYS`) covers only these 12 cross-provider keys:

| Key | Reason |
|-----|--------|
| `tools_githubCopilotToken` | Copilot sub-plugin token |
| `common_openai_servicetier` | OpenAI provider setting |
| `chat_claude_caching` | Anthropic provider toggle |
| `chat_claude_cachingBreakpoints` | Anthropic caching config |
| `chat_claude_cachingMaxExtension` | Anthropic caching config |
| `chat_gemini_preserveSystem` | Gemini provider toggle |
| `chat_gemini_showThoughtsToken` | Gemini provider toggle |
| `chat_gemini_useThoughtSignature` | Gemini provider toggle |
| `chat_gemini_usePlainFetch` | Gemini provider toggle |
| `chat_vertex_preserveSystem` | Vertex provider toggle |
| `chat_vertex_showThoughtsToken` | Vertex provider toggle |
| `chat_vertex_useThoughtSignature` | Vertex provider toggle |

All of these are declared in CPM's own plugin header (`//@arg`). Adding a new non-prefixed key requires explicit review before adding to this allowlist.

Dynamic `exportKeys` from sub-plugin tabs are filtered through `isManagedSettingKey()` — only keys matching the prefix or allowlist pass. Unrelated keys are silently dropped.

### 3. `window.*` globals
CPM-owned window globals must use one of these prefixes:
- `_cpm` / `__cpm`
- `CupcakePM`
- `CPM_`
- `cpm` (case insensitive)

Examples: `window._cpmCopilotApiToken`, `window.CupcakePM`, `window.CPM_VERSION`

These are cleaned up during purge by scanning `Object.keys(window)` for matching prefixes.

### 4. In-memory state
CPM uses `state.*` from `shared-state.js`. The purge clears all mutable state:
- `state.ALL_DEFINED_MODELS`
- `state.CUSTOM_MODELS_CACHE`
- `state.vertexTokenCache` (contains OAuth tokens — security-sensitive)
- `SubPluginManager.plugins`

---

## Full Delete Scope

`purgeAllCpmData()` removes:

| Category | What | How |
|----------|------|-----|
| pluginStorage | 5 known keys | Explicit deletion |
| pluginStorage | Any `cpm_*`/`cpm-*` discovered key | Wildcard scan |
| @arg settings | ~83 `cpm_*` keys + 12 allowlisted keys | `getManagedSettingKeys()` |
| @arg settings | 160 legacy `cpm_c1..c10_*` keys | Explicit loop |
| In-memory | Models, plugins, token caches | Direct reset |
| Window globals | All `_cpm*`, `CupcakePM*`, `CPM_*` | Prefix scan + delete |

It must **never** remove:
- Unrelated RisuAI assets or characters
- Unrelated datasets
- Other plugins' settings or storage
- Third-party plugin data
- App-level settings not owned by CPM

---

## Enforcement (Automated Tests)

| Test File | What It Guards |
|-----------|----------------|
| `tests/purge-ownership-policy.test.js` | Static scan: all pluginStorage keys use `cpm_*`; all export keys pass ownership filter; all sub-plugin `setArg` keys are in managed set; all window globals use CPM prefix; non-prefixed keys match exact allowlist |
| `tests/settings-backup.test.js` | Every `@arg` in plugin header is in managed keys; dynamic export key filter rejects unrelated keys |
| `tests/sub-plugin-execute.test.js` | Purge clears all known storage keys; purge ignores non-CPM storage keys; clears vertex token cache; clears window globals while preserving non-CPM globals; isolates unrelated data |

---

## Checklist for Future Changes

Before adding a new persisted key:
1. **Prefer** a `cpm_` or `cpm-` prefix. Always.
2. If a non-prefixed arg is absolutely needed, justify it and add it to `NON_PREFIX_MANAGED_SETTING_KEYS`.
3. If exposing it via `exportKeys`, confirm `isManagedSettingKey()` accepts it.
4. If adding a new `pluginStorage` key, ensure it starts with `cpm_` or `cpm-`.
5. If adding a new `window.*` global, use `_cpm` prefix.
6. Add it to `BASE_SETTING_KEYS` if it's an @arg (don't rely solely on dynamic `exportKeys`).
7. Run `npm test` and verify all ownership tests pass before shipping.
