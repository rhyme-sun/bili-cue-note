import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const outDir = resolve(root, 'dist');
const sourcemap = process.env.SOURCE_MAP !== 'false';

await rm(outDir, { recursive: true, force: true });

const base = {
  root,
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: false,
    target: 'chrome120',
    minify: true,
    sourcemap,
    reportCompressedSize: false,
  },
};

async function buildLib(entry, fileName, name) {
  await build({
    ...base,
    build: {
      ...base.build,
      lib: {
        entry: resolve(root, entry),
        formats: ['iife'],
        name,
        fileName: () => fileName,
      },
    },
  });
}

// Options page (HTML entry, may emit CSS/assets)
await build({
  ...base,
  base: './',
  build: {
    ...base.build,
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'options.html') },
  },
});

// Content script: React panel bundled into one IIFE file (Shadow DOM + inline CSS)
await buildLib('src/content/index.tsx', 'content.js', 'BiliCueNoteContent');

// MAIN-world hook / page-context bridge
await buildLib('src/content/injected.ts', 'injected.js', 'BiliCueNoteInjected');

// Background service worker
await buildLib('src/background/index.ts', 'background.js', 'BiliCueNoteBackground');

await mkdir(outDir, { recursive: true });
await cp(resolve(root, 'public/manifest.json'), resolve(outDir, 'manifest.json'));
await cp(resolve(root, 'public/icons'), resolve(outDir, 'icons'), { recursive: true });

console.log('Built extension to dist/');
