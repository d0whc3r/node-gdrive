import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sea from 'node:sea';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface SelfUpdateOptions {
  repo: string;
  binName: string;
  npmPackage: string;
  currentVersion: string;
  tag: string;
  dryRun?: boolean;
  /** Internal overrides for unit tests. */
  platform?: NodeJS.Platform;
  arch?: string;
  isStandalone?: boolean;
  execPath?: string;
  fetchImpl?: typeof fetch;
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}

export interface SelfUpdateResult {
  updated: boolean;
  upToDate: boolean;
  standalone: boolean;
  currentVersion: string;
  latestVersion: string;
  targetPath?: string;
  dryRun?: boolean;
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets?: GitHubReleaseAsset[];
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

/**
 * Compares two semantic version strings (a > b => 1, a < b => -1, equal => 0).
 */
export function compareSemver(a: string, b: string): number {
  const [aCore, aPre] = normalizeVersion(a).split('-', 2);
  const [bCore, bPre] = normalizeVersion(b).split('-', 2);
  const aParts = aCore.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const bParts = bCore.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(aParts.length, bParts.length, 3);

  for (let i = 0; i < len; i += 1) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) {
      return av > bv ? 1 : -1;
    }
  }

  if (aPre && !bPre) {
    return -1;
  }
  if (!aPre && bPre) {
    return 1;
  }
  if (aPre && bPre) {
    return aPre.localeCompare(bPre);
  }
  return 0;
}

/**
 * Resolves the GitHub Release asset filename for the current OS and CPU architecture.
 */
export function resolveReleaseAssetName(binName: string, platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  if (platform === 'linux' && arch === 'x64') {
    return `${binName}-linux-x64`;
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return `${binName}-macos-arm64`;
  }
  if (platform === 'win32' && arch === 'x64') {
    return `${binName}-win-x64.exe`;
  }
  throw new Error(`No prebuilt standalone binary for ${platform}/${arch}. Supported targets: linux/x64, darwin/arm64, win32/x64.`);
}

async function fetchLatestRelease(repo: string, userAgent: string, fetchImpl: typeof fetch): Promise<GitHubRelease> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': userAgent
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to check latest release (${res.status} ${res.statusText})`);
  }
  const data = (await res.json()) as GitHubRelease;
  if (!data.tag_name) {
    throw new Error('Invalid GitHub release response: missing tag_name');
  }
  return data;
}

async function replaceBinaryAtomically(
  downloadUrl: string,
  targetPath: string,
  platform: NodeJS.Platform,
  userAgent: string,
  fetchImpl: typeof fetch
): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(dir, `.${path.basename(targetPath)}.update-${process.pid}-${Date.now()}`);

  const res = await fetchImpl(downloadUrl, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow'
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download update from ${downloadUrl} (${res.status} ${res.statusText})`);
  }

  try {
    const bodyStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
    const writeStream = fs.createWriteStream(tmpPath, { mode: 0o755 });
    await pipeline(bodyStream, writeStream);

    if (platform !== 'win32') {
      await fsp.chmod(tmpPath, 0o755);
      await fsp.rename(tmpPath, targetPath);
      return;
    }

    // Windows cannot overwrite a running executable directly, but allows renaming it out of the way.
    const backupPath = `${targetPath}.old`;
    await fsp.rm(backupPath, { force: true }).catch(() => undefined);
    await fsp.rename(targetPath, backupPath);
    try {
      await fsp.rename(tmpPath, targetPath);
    } catch (renameErr) {
      await fsp.rename(backupPath, targetPath).catch(() => undefined);
      throw renameErr;
    }
  } catch (err) {
    await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
    const errno = err as NodeJS.ErrnoException;
    if (errno.code === 'EACCES' || errno.code === 'EPERM') {
      throw new Error(`Permission denied writing to "${dir}". Re-run with elevated permissions or reinstall into ~/.local/bin.`);
    }
    throw err;
  }
}

export async function selfUpdate(options: SelfUpdateOptions): Promise<SelfUpdateResult> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console;
  const currentVersion = normalizeVersion(options.currentVersion);
  const standalone = options.isStandalone ?? sea.isSea();
  const userAgent = `${options.binName}/${currentVersion}`;

  const release = await fetchLatestRelease(options.repo, userAgent, fetchImpl);
  const latestVersion = normalizeVersion(release.tag_name);

  if (compareSemver(latestVersion, currentVersion) <= 0) {
    logger.info?.(`${options.tag} Already up to date (v${currentVersion}).`);
    return {
      updated: false,
      upToDate: true,
      standalone,
      currentVersion,
      latestVersion
    };
  }

  if (!standalone) {
    logger.info?.(
      `${options.tag} Update available: v${currentVersion} -> v${latestVersion}. Installed via Node.js/npm; run "npm install -g ${options.npmPackage}@latest" to upgrade.`
    );
    return {
      updated: false,
      upToDate: false,
      standalone: false,
      currentVersion,
      latestVersion
    };
  }

  const rawExecPath = options.execPath ?? process.execPath;
  const targetPath = fs.existsSync(rawExecPath) ? fs.realpathSync(rawExecPath) : rawExecPath;
  const assetName = resolveReleaseAssetName(options.binName, platform, arch);
  const matchedAsset = release.assets?.find((a) => a.name === assetName);
  const downloadUrl = matchedAsset?.browser_download_url ?? `https://github.com/${options.repo}/releases/download/${release.tag_name}/${assetName}`;

  if (options.dryRun) {
    logger.info?.(`${options.tag} [dry-run] Would update ${targetPath} from v${currentVersion} to v${latestVersion} (${assetName}).`);
    return {
      updated: false,
      upToDate: false,
      standalone: true,
      currentVersion,
      latestVersion,
      targetPath,
      dryRun: true
    };
  }

  logger.info?.(`${options.tag} Updating ${options.binName} from v${currentVersion} to v${latestVersion}...`);
  await replaceBinaryAtomically(downloadUrl, targetPath, platform, userAgent, fetchImpl);
  logger.info?.(`${options.tag} Updated successfully to v${latestVersion} (${targetPath}).`);

  return {
    updated: true,
    upToDate: false,
    standalone: true,
    currentVersion,
    latestVersion,
    targetPath
  };
}
