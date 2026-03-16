import { readFileSync } from 'fs';
import { join } from 'path';
import { handleCorsOptions, corsHeaders } from './_shared/cors.js';

// Vercel Serverless Function: Serves lightweight version manifest only.
// Returns just the "versions" portion of update-bundle.json (~0.5KB)
// Used by Cupcake Provider Manager's silent update notification system.

const CACHE_POLICY = 'public, max-age=300, stale-while-revalidate=60';

export default function handler(req, res) {
    if (handleCorsOptions(req, res)) return;

    try {
        const bundlePath = join(process.cwd(), 'update-bundle.json');
        const raw = readFileSync(bundlePath, 'utf-8');
        const bundle = JSON.parse(raw);

        // Return only versions (no code), keeping it lightweight
        const versionsOnly = bundle.versions || {};
        res.writeHead(200, corsHeaders(CACHE_POLICY, {
            'Content-Type': 'application/json; charset=utf-8',
        }));
        res.end(JSON.stringify(versionsOnly));
    } catch (err) {
        res.writeHead(500, corsHeaders(CACHE_POLICY, {
            'Content-Type': 'application/json',
        }));
        res.end(JSON.stringify({ error: 'Failed to read versions', details: err.message }));
    }
}
