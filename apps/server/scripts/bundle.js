#!/usr/bin/env node
/**
 * Bundle script for creating a standalone server bundle
 * This creates a single-file bundle that can be deployed as an MCP plugin
 */

import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

async function bundle() {
  console.log('Bundling server for standalone deployment...');

  try {
    await build({
      entryPoints: [resolve(projectRoot, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outfile: resolve(projectRoot, 'dist/bundle.js'),
      external: [
        // Node.js built-in modules
        'fs',
        'path',
        'os',
        'readline',
        'events',
        'stream',
        'util',
        'crypto',
        'http',
        'https',
        'net',
        'tls',
        'child_process',
        'worker_threads',
      ],
      minify: false, // Keep readable for debugging
      sourcemap: true,
      banner: {
        js: '#!/usr/bin/env node\n// Claude Code Analytics - MCP Plugin Server\n',
      },
    });

    console.log('Bundle created: dist/bundle.js');
    console.log('Bundle can be used as standalone MCP plugin entry point');
  } catch (error) {
    console.error('Bundle failed:', error);
    process.exit(1);
  }
}

bundle();
