import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const tag = process.env.RELEASE_TAG || `v${pkg.version}`;
const name = `${pkg.name}-${tag}`;
const outDir = resolve(root, 'release');
const stageRoot = resolve(root, 'temp/release');
const stageDir = resolve(stageRoot, name);
const zipPath = resolve(outDir, `${name}.zip`);

// Release builds omit sourcemaps to keep the downloadable package small.
execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], {
  cwd: root,
  env: { ...process.env, SOURCE_MAP: 'false' },
  stdio: 'inherit',
});

await rm(stageRoot, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(outDir, { recursive: true });
await mkdir(stageDir, { recursive: true });
await cp(resolve(root, 'dist'), stageDir, { recursive: true });

if (process.platform === 'win32') {
  // Windows 自带的 bsdtar 能生成标准的 zip（条目使用 / 分隔）。
  const systemTar = resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (existsSync(systemTar)) {
    execFileSync(systemTar, ['-a', '-c', '-f', zipPath, '-C', stageRoot, name], {
      stdio: 'inherit',
    });
  } else {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$ErrorActionPreference = 'Stop'; Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  }
} else {
  execFileSync('zip', ['-r', zipPath, name], { cwd: stageRoot, stdio: 'inherit' });
}

await rm(stageRoot, { recursive: true, force: true });
console.log(`Packaged ${zipPath}`);
