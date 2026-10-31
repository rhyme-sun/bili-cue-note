import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * Render the extension icon from `public/icons/icon.svg` into the PNG sizes
 * Chrome expects. Uses the same Edge/Playwright setup as the smoke test.
 *
 * Usage: npm run icons
 * Requires Microsoft Edge installed (override with EDGE_PATH).
 */

const edgePath =
  process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sourcePath = resolve(process.cwd(), 'public/icons/icon.svg');
const outDir = resolve(process.cwd(), 'public/icons');
const sizes = [16, 32, 48, 128];

const svg = await readFile(sourcePath, 'utf8');
const browser = await chromium.launch({ executablePath: edgePath, headless: true });

try {
  for (const size of sizes) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({
      path: resolve(outDir, `icon${size}.png`),
      omitBackground: true,
    });
    await page.close();
    console.log(`wrote public/icons/icon${size}.png`);
  }
} finally {
  await browser.close();
}
