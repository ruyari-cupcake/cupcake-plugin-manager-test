import { readFileSync } from 'fs';
import { join } from 'path';
import { handleCorsOptions, corsHeaders } from './_shared/cors.js';

// Vercel Serverless Function: Serves update-bundle.json with full CORS support.
// This handles OPTIONS preflight properly, which static file hosting cannot guarantee.
// Used by Cupcake Provider Manager's update system via risuFetch(plainFetchForce).

const CACHE_POLICY = 'no-cache, no-store, must-revalidate';

export default function handler(req, res) {
    if (handleCorsOptions(req, res)) return;

    try {
        const bundlePath = join(process.cwd(), 'update-bundle.json');
        const data = readFileSync(bundlePath, 'utf-8');
        res.writeHead(200, corsHeaders(CACHE_POLICY, {
            'Content-Type': 'application/json; charset=utf-8',
        }));
        res.end(data);
    } catch (err) {
        res.writeHead(500, corsHeaders(CACHE_POLICY, {
            'Content-Type': 'application/json',
        }));
        res.end(JSON.stringify({ error: 'Failed to read update bundle', details: err.message }));
    }
}
