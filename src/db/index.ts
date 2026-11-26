import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { mongodbProvider } from './providers/mongodb';
import { mysqlProvider } from './providers/mysql';
import { postgresProvider } from './providers/postgres';
import { sqliteProvider } from './providers/sqlite';
import type { DbDumpFileResult, DbDumpOptions, DbDumpResult, DbDumpStreamResult, DbEngine, DbProvider } from './types';

export const DB_PROVIDERS: readonly DbProvider[] = [postgresProvider, mysqlProvider, mongodbProvider, sqliteProvider];

const PROVIDER_MAP = new Map<string, DbProvider>();
for (const provider of DB_PROVIDERS) {
  PROVIDER_MAP.set(provider.engine, provider);
  for (const alias of provider.aliases) {
    PROVIDER_MAP.set(alias, provider);
  }
}

export const SUPPORTED_DB_ENGINES: readonly DbEngine[] = DB_PROVIDERS.map((p) => p.engine);

/**
 * Resolves a database engine name or alias to its canonical `DbEngine`.
 */
export function normalizeDbEngine(value: string, tag = '[db]'): DbEngine {
  const normalized = value.trim().toLowerCase();
  const provider = PROVIDER_MAP.get(normalized);
  if (!provider) {
    throw new Error(`${tag} Unsupported database engine "${value}". Supported engines: ${SUPPORTED_DB_ENGINES.join(', ')}.`);
  }
  return provider.engine;
}

/**
 * Infers the database engine from a connection URL scheme.
 */
export function detectDbEngineFromUrl(url: string, tag = '[db]'): DbEngine {
  const trimmed = url.trim();
  if (/^postgres(?:ql)?:\/\//i.test(trimmed)) {
    return 'postgres';
  }
  if (/^(?:mysql|mariadb):\/\//i.test(trimmed)) {
    return 'mysql';
  }
  if (/^mongodb(?:\+srv)?:\/\//i.test(trimmed)) {
    return 'mongodb';
  }
  if (/^(?:sqlite3?:|file:)/i.test(trimmed)) {
    return 'sqlite';
  }
  throw new Error(`${tag} Could not detect database engine from URL. Supported schemes: postgresql://, mysql://, mariadb://, mongodb://, sqlite://.`);
}

async function materializeStreamToFile(result: DbDumpStreamResult): Promise<DbDumpFileResult> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), `db-${result.engine}-`));
  await fsp.chmod(tempDir, 0o700);
  const filePath = path.join(tempDir, path.basename(result.filename));

  try {
    const writeStream = fs.createWriteStream(filePath, { mode: 0o600 });
    await pipeline(result.stream, writeStream);
    await result.wait();
  } catch (error) {
    await result.cleanup();
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  return {
    kind: 'file',
    engine: result.engine,
    filename: result.filename,
    mimeType: result.mimeType,
    filePath,
    tempDir,
    cleanup: async () => {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  };
}

/**
 * Creates a database dump using the appropriate engine provider.
 * Returns a live stream by default for CLI-backed engines (O(1) memory, zero temp disk),
 * or materializes to a secure temporary file when `preferFile` is true (e.g. for `--zip`).
 */
export async function dumpDatabase(options: DbDumpOptions): Promise<DbDumpResult> {
  const tag = options.tag ?? '[db]';
  let engine: DbEngine;

  if (options.engine) {
    engine = normalizeDbEngine(options.engine, tag);
  } else if (options.url) {
    engine = detectDbEngineFromUrl(options.url, tag);
  } else if (process.env.DATABASE_URL) {
    engine = detectDbEngineFromUrl(process.env.DATABASE_URL, tag);
  } else {
    throw new Error(`${tag} Database engine not specified. Pass --db <${SUPPORTED_DB_ENGINES.join('|')}> or --db-url <uri>.`);
  }

  const provider = PROVIDER_MAP.get(engine)!;
  const result = await provider.dump({ ...options, engine, tag });

  if (options.preferFile && result.kind === 'stream') {
    return materializeStreamToFile(result);
  }

  return result;
}

export { findBinary, sanitizeFilenamePart, sanitizeUrl } from './spawn';
export type { DbDumpFileResult, DbDumpOptions, DbDumpResult, DbDumpStreamResult, DbEngine, DbProvider, PostgresFormat } from './types';
