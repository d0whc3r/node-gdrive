import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareSemver, normalizeVersion, resolveReleaseAssetName, selfUpdate } from '../cli/updater';

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('CLI self-updater (unit)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes and compares semantic versions accurately', () => {
    expect(normalizeVersion('v3.6.0')).toBe('3.6.0');
    expect(compareSemver('3.10.0', '3.9.0')).toBe(1);
    expect(compareSemver('3.6.0', '3.6.0')).toBe(0);
    expect(compareSemver('3.5.1', '3.6.0')).toBe(-1);
    expect(compareSemver('4.0.0', '4.0.0-beta.1')).toBe(1);
    expect(compareSemver('4.0.0-alpha.1', '4.0.0-beta.1')).toBeLessThan(0);
  });

  it('resolves release asset names per platform/arch and rejects unsupported targets', () => {
    expect(resolveReleaseAssetName('node-gdrive', 'linux', 'x64')).toBe('node-gdrive-linux-x64');
    expect(resolveReleaseAssetName('node-gdrive', 'darwin', 'arm64')).toBe('node-gdrive-macos-arm64');
    expect(resolveReleaseAssetName('node-gdrive', 'win32', 'x64')).toBe('node-gdrive-win-x64.exe');
    expect(() => resolveReleaseAssetName('node-gdrive', 'freebsd', 'x64')).toThrow(/No prebuilt standalone binary/);
  });

  it('reports up-to-date when current version matches latest release', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ tag_name: 'v3.6.0', assets: [] }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-gdrive',
      binName: 'node-gdrive',
      npmPackage: '@d0whc3r/node-gdrive',
      currentVersion: '3.6.0',
      tag: '[node-gdrive]',
      isStandalone: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result).toEqual({
      updated: false,
      upToDate: true,
      standalone: true,
      currentVersion: '3.6.0',
      latestVersion: '3.6.0'
    });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Already up to date'));
  });

  it('does not overwrite Node binary when running via npm/Node (non-SEA)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ tag_name: 'v4.0.0', assets: [] }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-gdrive',
      binName: 'node-gdrive',
      npmPackage: '@d0whc3r/node-gdrive',
      currentVersion: '3.6.0',
      tag: '[node-gdrive]',
      isStandalone: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result.updated).toBe(false);
    expect(result.standalone).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('npm install -g @d0whc3r/node-gdrive@latest'));
  });

  it('supports --dry-run without downloading or modifying binary', async () => {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'updater-dry-'));
    tempDirs.push(workDir);
    const binPath = path.join(workDir, 'node-gdrive');
    await fsp.writeFile(binPath, 'old-binary', { mode: 0o755 });

    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        tag_name: 'v4.0.0',
        assets: [{ name: 'node-gdrive-linux-x64', browser_download_url: 'https://example.com/node-gdrive-linux-x64' }]
      })
    );
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-gdrive',
      binName: 'node-gdrive',
      npmPackage: '@d0whc3r/node-gdrive',
      currentVersion: '3.6.0',
      tag: '[node-gdrive]',
      dryRun: true,
      platform: 'linux',
      arch: 'x64',
      isStandalone: true,
      execPath: binPath,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result.updated).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(binPath, 'utf8')).toBe('old-binary');
  });

  it('downloads and atomically replaces standalone binary', async () => {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'updater-real-'));
    tempDirs.push(workDir);
    const binPath = path.join(workDir, 'node-gdrive');
    await fsp.writeFile(binPath, 'old-binary', { mode: 0o755 });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          tag_name: 'v4.1.0',
          assets: [{ name: 'node-gdrive-macos-arm64', browser_download_url: 'https://example.com/node-gdrive-macos-arm64' }]
        })
      )
      .mockResolvedValueOnce(new Response('new-binary-payload', { status: 200 }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-gdrive',
      binName: 'node-gdrive',
      npmPackage: '@d0whc3r/node-gdrive',
      currentVersion: '3.6.0',
      tag: '[node-gdrive]',
      platform: 'darwin',
      arch: 'arm64',
      isStandalone: true,
      execPath: binPath,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result.updated).toBe(true);
    expect(result.latestVersion).toBe('4.1.0');
    expect(fs.readFileSync(binPath, 'utf8')).toBe('new-binary-payload');
    expect(fs.readdirSync(workDir)).toEqual(['node-gdrive']);
  });
});
