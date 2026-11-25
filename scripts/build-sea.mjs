import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const output = isWindows ? 'node-gdrive.exe' : 'node-gdrive';

const seaConfig = {
  main: 'dist/cli.sea.cjs',
  output,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: true
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sea-config-gdrive-'));
const tmpConfig = path.join(tmpDir, 'sea-config.json');
fs.writeFileSync(tmpConfig, JSON.stringify(seaConfig, null, 2), { mode: 0o600 });

try {
  execFileSync(process.execPath, ['--build-sea', tmpConfig], { stdio: 'inherit' });
  if (isMac) {
    execFileSync('codesign', ['--sign', '-', output], { stdio: 'inherit' });
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
