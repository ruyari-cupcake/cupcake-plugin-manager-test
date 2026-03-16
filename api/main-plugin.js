import { readFileSync } from 'fs';
import { join } from 'path';
import { handleCorsOptions, corsHeaders } from './_shared/cors.js';

const CACHE_POLICY = 'no-cache, no-store, must-revalidate';

export default function handler(req, res) {
    if (handleCorsOptions(req, res)) return;

    try {
        const bundlePath = join(process.cwd(), 'update-bundle.json');
        const bundleRaw = readFileSync(bundlePath, 'utf-8');
        const bundle = JSON.parse(bundleRaw);
        const code = bundle?.code?.['provider-manager.js'];

        if (!code || typeof code !== 'string') {
            throw new Error('provider-manager.js not found in update-bundle.json');
        }

        res.writeHead(200, corsHeaders(CACHE_POLICY, {
            'Content-Type': 'application/javascript; charset=utf-8',
        }));
        res.end(code);
    } catch (bundleErr) {
        try {
            const fallbackPath = join(process.cwd(), 'provider-manager.js');
            const code = readFileSync(fallbackPath, 'utf-8');
            res.writeHead(200, corsHeaders(CACHE_POLICY, {
                'Content-Type': 'application/javascript; charset=utf-8',
            }));
            res.end(code);
        } catch (fileErr) {
            res.writeHead(500, corsHeaders(CACHE_POLICY, {
                'Content-Type': 'application/json; charset=utf-8',
            }));
            res.end(JSON.stringify({
                error: 'Failed to read main plugin code',
                details: bundleErr?.message || fileErr?.message || 'unknown error',
            }));
        }
    }
}