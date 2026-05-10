import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Copies pdfjs's worker bundle into public/ so Next.js serves it at a stable
// URL (`/pdf.worker.mjs`). Idempotent: skips the copy when the destination
// already matches the installed pdfjs version.
//
// Run via `pnpm prepare` (npm scripts hook). Standalone, takes no args.

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const projectRoot = resolve(here, '..');
const srcWorker = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dstWorker = resolve(projectRoot, 'public', 'pdf.worker.mjs');

const pdfjsPkg = JSON.parse(
  readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8'),
) as { version: string };

const dstDir = dirname(dstWorker);
if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });

if (existsSync(dstWorker)) {
  const existing = readFileSync(dstWorker);
  const incoming = readFileSync(srcWorker);
  if (existing.equals(incoming)) {
    console.log(`pdf-worker: already current (pdfjs ${pdfjsPkg.version})`);
    process.exit(0);
  }
}

copyFileSync(srcWorker, dstWorker);
console.log(`pdf-worker: copied pdfjs ${pdfjsPkg.version} → public/pdf.worker.mjs`);
