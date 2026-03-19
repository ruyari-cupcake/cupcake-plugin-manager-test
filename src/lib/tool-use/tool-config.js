/**
 * @fileoverview Tool-Use configuration loader.
 * Reads user settings from Risu.getArgument / safeGetArg.
 */

// @ts-nocheck
/* global Risu */
const _cache = {};

async function _getArg(id) {
    try { return (await Risu.getArgument(id)) ?? ''; } catch { return ''; }
}
async function _getBool(id, def = false) {
    try {
        const v = await Risu.getArgument(id);
        if (v === true || v === 'true' || v === '1') return true;
        if (v === false || v === 'false' || v === '0' || v === '') return def;
        return def;
    } catch { return def; }
}

export async function isToolUseEnabled() {
    return _getBool('cpm_tool_use_enabled', false);
}

export async function isToolEnabled(toolId) {
    if (!(await isToolUseEnabled())) return false;
    return _getBool(`cpm_tool_${toolId}`, false);
}

export async function getToolMaxDepth() {
    const v = await _getArg('cpm_tool_max_depth');
    const n = parseInt(v, 10);
    return (Number.isFinite(n) && n > 0) ? Math.min(n, 20) : 5;
}

export async function getToolTimeout() {
    const v = await _getArg('cpm_tool_timeout');
    const n = parseInt(v, 10);
    return (Number.isFinite(n) && n > 0) ? Math.min(n, 60000) : 10000;
}

/** Web search config */
export async function getWebSearchConfig() {
    return {
        provider: (await _getArg('cpm_tool_websearch_provider')) || 'brave',
        url: (await _getArg('cpm_tool_websearch_url')) || '',
        key: (await _getArg('cpm_tool_websearch_key')) || '',
        cx: (await _getArg('cpm_tool_websearch_cx')) || '',
    };
}
