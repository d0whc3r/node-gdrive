import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { DbDumpStreamResult, DbEngine } from './types';

const MAX_STDERR_BYTES = 16 * 1024;

/**
 * Checks whether an executable binary is available on PATH (or as an explicit path).
 */
export function findBinary(candidates: readonly string[]): string | undefined {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (isExecutable(candidate)) {
        return candidate;
      }
      continue;
    }
    for (const dir of dirs) {
      for (const ext of exts) {
        const fullPath = path.join(dir, `${candidate}${ext}`);
        if (isExecutable(fullPath)) {
          return fullPath;
        }
      }
    }
  }
  return undefined;
}

function isExecutable(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips password/credentials from a connection URI before including it in errors or logs.
 */
export function sanitizeUrl(rawText: string): string {
  return rawText.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:@/\s]+):([^@/\s]+)@/g, '$1:***@');
}

/**
 * Sanitizes a database identifier for safe inclusion in a dump filename.
 */
export function sanitizeFilenamePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'db';
}

export interface SpawnDumpOptions {
  engine: DbEngine;
  binary: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  filename: string;
  mimeType: string;
  tag: string;
  installHint: string;
  onCleanup?: () => Promise<void> | void;
}

/**
 * Spawns a database dump binary safely (without a shell) and exposes its stdout
 * as a backpressure-aware Readable stream that propagates non-zero exit errors.
 */
export function spawnDumpStream(options: SpawnDumpOptions): DbDumpStreamResult {
  const child = spawn(options.binary, options.args, {
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  const passThrough = new PassThrough();
  const stderrChunks: Buffer[] = [];
  let stderrLength = 0;
  let cleanupPromise: Promise<void> | undefined;

  const runOnCleanup = (): Promise<void> => {
    if (!cleanupPromise) {
      cleanupPromise = Promise.resolve(options.onCleanup?.());
    }
    return cleanupPromise;
  };

  child.stderr.on('data', (chunk: Buffer) => {
    if (stderrLength < MAX_STDERR_BYTES) {
      const remaining = MAX_STDERR_BYTES - stderrLength;
      stderrChunks.push(chunk.subarray(0, remaining));
      stderrLength += Math.min(chunk.length, remaining);
    }
  });

  child.stdout.pipe(passThrough, { end: false });

  let settled = false;
  let resolveWait!: () => void;
  let rejectWait!: (err: Error) => void;

  const waitPromise = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });
  // Prevent unhandled rejection if caller only consumes stream errors before awaiting wait()
  waitPromise.catch(() => undefined);

  const fail = (err: Error): void => {
    if (settled) {
      return;
    }
    settled = true;
    void runOnCleanup();
    if (!passThrough.destroyed) {
      passThrough.destroy(err);
    }
    rejectWait(err);
  };

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      fail(new Error(`${options.tag} "${options.binary}" not found in PATH. ${options.installHint}`));
      return;
    }
    fail(new Error(`${options.tag} Failed to start "${options.binary}": ${err.message}`));
  });

  child.on('close', (code, signal) => {
    if (settled) {
      return;
    }
    if (code === 0) {
      settled = true;
      void runOnCleanup();
      passThrough.end();
      resolveWait();
      return;
    }
    const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
    const detail = stderrText ? `: ${sanitizeUrl(stderrText)}` : '';
    const reason = signal ? `terminated by signal ${signal}` : `exited with code ${code ?? 'unknown'}`;
    fail(new Error(`${options.tag} ${options.binary} ${reason}${detail}`));
  });

  return {
    kind: 'stream',
    engine: options.engine,
    filename: options.filename,
    mimeType: options.mimeType,
    stream: passThrough,
    wait: () => waitPromise,
    cleanup: async () => {
      if (!settled && !child.killed) {
        child.kill('SIGTERM');
      }
      if (!passThrough.destroyed) {
        passThrough.destroy();
      }
      await runOnCleanup();
    }
  };
}
