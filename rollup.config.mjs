/**
 * Rollup Configuration — Cupcake Provider Manager
 *
 * Bundles modular ES source (src/) into a single IIFE for the RisuAI V3
 * iframe sandbox (about:srcdoc, CSP connect-src 'none').
 *
 * Output: dist/provider-manager.js (self-contained, no external imports)
 * The RisuAI plugin header (src/plugin-header.js) is prepended as a banner.
 */
import resolve from '@rollup/plugin-node-resolve';
import { readFileSync } from 'node:fs';

const pluginHeader = readFileSync(
  new URL('./src/plugin-header.js', import.meta.url),
  'utf-8'
).trimEnd();

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/provider-manager.js',
    format: 'iife',
    name: 'CupcakeProviderManager',
    banner: pluginHeader,
    // No sourcemap — production runtime in iframe sandbox
  },
  plugins: [
    resolve(),
  ],
};
