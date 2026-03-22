// @ts-check
/**
 * key-pool.js — API Key rotation engine.
 * Supports whitespace-separated key pools and JSON credential rotation (Vertex AI).
 * Dependency-injected via setGetArgFn() for testability.
 */
import { MAX_KEY_RETRIES } from './constants.js';

/**
 * KeyPool: key rotation. Keys are whitespace-separated in //@arg fields.
 * Random pick per request; on 429/529/503, drain failed key and retry.
 */
export const KeyPool = {
    /** @type {Record<string, any>} */
    _pools: {},
    /** Injected safeGetArg function. Set via setGetArgFn(). @type {((key: string, defaultValue?: string) => Promise<string>) | null} */
    _getArgFn: null,

    /**
     * Set the argument retrieval function (dependency injection).
     * @param {(key: string, defaultValue?: string) => Promise<string>} fn
     */
    setGetArgFn(fn) {
        this._getArgFn = fn;
    },

    /**
     * Parse keys from the setting string (whitespace-separated), cache them,
     * and return a random key from the pool.
     * @param {string} argName
     */
    async pick(argName) {
        const pool = this._pools[argName];
        if (pool && pool._inline && pool.keys.length > 0) {
            return pool.keys[Math.floor(Math.random() * pool.keys.length)];
        }
        const getArg = this._getArgFn;
        if (!getArg) return '';  // No getArgFn → cannot re-parse keys after reset()
        const raw = await getArg(argName);
        if (!pool || pool.lastRaw !== raw || pool.keys.length === 0) {
            this._pools[argName] = {
                lastRaw: raw,
                keys: (raw || '').trim().split(/\s+/).filter(k => k.length > 0)
            };
        }
        const keys = this._pools[argName].keys;
        if (keys.length === 0) return '';
        return keys[Math.floor(Math.random() * keys.length)];
    },

    /**
     * Remove a failed key from the pool. Returns remaining count.
     * @param {string} argName
     * @param {string} failedKey
     */
    drain(argName, failedKey) {
        const pool = this._pools[argName];
        if (!pool) return 0;
        const idx = pool.keys.indexOf(failedKey);
        if (idx > -1) pool.keys.splice(idx, 1);
        return pool.keys.length;
    },

    /**
     * Get the number of remaining keys in the pool.
     * @param {string} argName
     */
    remaining(argName) {
        return this._pools[argName]?.keys?.length || 0;
    },

    /**
     * Force re-parse keys from settings on next pick.
     * @param {string} argName
     */
    reset(argName) {
        delete this._pools[argName];
    },

    /**
     * Internal rotation implementation shared by withRotation and withJsonRotation.
     * @param {string} argName
     * @param {(argName: string) => Promise<string>} pickFn
     * @param {(argName: string) => string} noKeyMsgFn
     * @param {string} logLabel
     * @param {(key: string) => Promise<any>} fetchFn
     * @param {{maxRetries?: number, isRetryable?: (result: any) => boolean}} opts
     */
    async _withRotationImpl(argName, pickFn, noKeyMsgFn, logLabel, fetchFn, opts) {
        const maxRetries = opts.maxRetries || MAX_KEY_RETRIES;
        const isRetryable = opts.isRetryable || ((/** @type {any} */ result) => {
            if (!result._status) return false;
            return result._status === 429 || result._status === 529 || result._status === 503;
        });

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const key = await pickFn.call(this, argName);
            if (!key) {
                return { success: false, content: noKeyMsgFn(argName) };
            }

            const result = await fetchFn(key);
            if (result.success || !isRetryable(result)) return result;

            const remaining = this.drain(argName, key);
            console.warn(`[KeyPool] 🔄 ${logLabel} 교체: ${argName} (HTTP ${result._status}, 남은 ${logLabel}: ${remaining}개, 시도: ${attempt + 1})`);

            if (remaining === 0) {
                console.warn(`[KeyPool] ⚠️ ${argName}의 모든 ${logLabel}가 소진되었습니다. 키를 재파싱합니다.`);
                this.reset(argName);
            }
        }
        return { success: false, content: `[KeyPool] 최대 재시도 횟수(${maxRetries})를 초과했습니다.` };
    },

    /**
     * Pick key → fetchFn(key) → on retryable error, drain and retry.
     * @param {string} argName
     * @param {(key: string) => Promise<any>} fetchFn
     * @param {{maxRetries?: number, isRetryable?: (result: any) => boolean}} [opts]
     */
    async withRotation(argName, fetchFn, opts = {}) {
        return this._withRotationImpl(
            argName, this.pick,
            (name) => `[KeyPool] ${name}에 사용 가능한 API 키가 없습니다. 설정에서 키를 확인하세요.`,
            '키', fetchFn, opts,
        );
    },

    // ── JSON Credential Rotation (Vertex AI 등 JSON 크레덴셜용) ──

    /** @param {string} raw */
    _looksLikeWindowsPath(raw) {
        const trimmed = (raw || '').trim();
        return /^[A-Za-z]:\\/.test(trimmed) || /^\\\\[^\\]/.test(trimmed);
    },

    /**
     * @param {string} raw
     * @param {any} [error]
     */
    _buildJsonCredentialError(raw, error) {
        if (this._looksLikeWindowsPath(raw)) {
            return new Error('JSON 인증 정보 대신 Windows 파일 경로가 입력되었습니다. 파일 경로가 아니라 Service Account JSON 본문 전체를 붙여넣어야 합니다.');
        }

        const message = error?.message || '알 수 없는 JSON 파싱 오류';
        if (/Bad Unicode escape/i.test(message)) {
            return new Error('JSON 파싱 오류: 역슬래시(\\)가 이스케이프되지 않았습니다. Windows 경로를 넣었다면 \\\\ 로 이스케이프하거나 파일 경로 대신 JSON 본문을 붙여넣으세요.');
        }

        return new Error(`JSON 인증 정보 파싱 오류: ${message}`);
    },

    /**
     * Extract individual JSON objects from raw textarea input.
     * Supports: single, comma-separated, JSON array, or newline-separated.
     * @param {string} raw
     */
    _parseJsonCredentials(raw) {
        const trimmed = (raw || '').trim();
        if (!trimmed) return [];
        if (this._looksLikeWindowsPath(trimmed)) {
            throw this._buildJsonCredentialError(trimmed);
        }

        let lastError = null;
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
        } catch (error) { lastError = error; }
        if (trimmed.startsWith('{')) {
            try {
                const arr = JSON.parse('[' + trimmed + ']');
                if (Array.isArray(arr)) return arr.filter(o => o && typeof o === 'object').map(o => JSON.stringify(o));
            } catch (error) { lastError = error; }
        }
        try {
            const obj = JSON.parse(trimmed);
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) return [trimmed];
        } catch (error) { lastError = error; }
        if (lastError && /Bad Unicode escape/i.test(/** @type {Error} */ (lastError).message || '')) {
            throw this._buildJsonCredentialError(trimmed, lastError);
        }
        return [];
    },

    /**
     * Parse JSON credentials from a textarea field, cache them,
     * and return a random one from the pool.
     * @param {string} argName
     */
    async pickJson(argName) {
        const getArg = this._getArgFn;
        if (!getArg) return '';  // No getArgFn → cannot re-parse keys after reset()
        const raw = await getArg(argName);
        const pool = this._pools[argName];
        if (!pool || pool.lastRaw !== raw || pool.keys.length === 0) {
            try {
                const jsons = this._parseJsonCredentials(raw);
                this._pools[argName] = { lastRaw: raw, keys: jsons, error: '' };
            } catch (error) {
                this._pools[argName] = { lastRaw: raw, keys: [], error: /** @type {Error} */ (error).message };
            }
        }
        const keys = this._pools[argName].keys;
        if (keys.length === 0) return '';
        return keys[Math.floor(Math.random() * keys.length)];
    },

    /**
     * Like withRotation but uses pickJson for JSON credential parsing.
     * @param {string} argName
     * @param {(key: string) => Promise<any>} fetchFn
     * @param {{maxRetries?: number, isRetryable?: (result: any) => boolean}} [opts]
     */
    async withJsonRotation(argName, fetchFn, opts = {}) {
        return this._withRotationImpl(
            argName, this.pickJson,
            (name) => {
                const errorMessage = this._pools[name]?.error;
                return errorMessage
                    ? `[KeyPool] ${errorMessage}`
                    : `[KeyPool] ${name}에 사용 가능한 JSON 인증 정보가 없습니다. 설정에서 확인하세요.`;
            },
            'JSON 인증', fetchFn, opts,
        );
    }
};
