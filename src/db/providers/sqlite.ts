import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import dayjs from 'dayjs';
import { sanitizeFilenamePart } from '../spawn';
import type { DbDumpFileResult, DbDumpOptions, DbProvider } from '../types';

function isSqliteUrl(value?: string): value is string {
  return Boolean(value && /^(?:sqlite3?:|file:)/i.test(value));
}

function resolveSqlitePath(options: DbDumpOptions, tag: string): string {
  const raw = options.database || options.url || process.env.SQLITE_PATH || (isSqliteUrl(process.env.DATABASE_URL) ? process.env.DATABASE_URL : '');
  if (!raw) {
    throw new Error(`${tag} Missing SQLite database path. Set $SQLITE_PATH (or --db-url sqlite:///path/to/db.sqlite).`);
  }

  let filePath = raw;
  if (/^sqlite3?:\/\//i.test(raw)) {
    filePath = decodeURIComponent(raw.replace(/^sqlite3?:\/\//i, ''));
  } else if (/^sqlite3?:/i.test(raw)) {
    filePath = decodeURIComponent(raw.replace(/^sqlite3?:/i, ''));
  } else if (/^file:/i.test(raw)) {
    filePath = decodeURIComponent(raw.replace(/^file:(\/\/)?/i, ''));
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${tag} SQLite database file not found: "${resolved}"`);
  }
  return resolved;
}

export const sqliteProvider: DbProvider = {
  engine: 'sqlite',
  aliases: ['sqlite3'],

  async dump(options: DbDumpOptions): Promise<DbDumpFileResult> {
    const tag = options.tag ?? '[db]';
    const sourcePath = resolveSqlitePath(options, tag);
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const filename = options.filename || `sqlite-${sanitizeFilenamePart(baseName)}-${dayjs().format('YYYY-MM-DD.HHmmss')}.sqlite`;

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'db-sqlite-'));
    await fsp.chmod(tempDir, 0o700);
    const destPath = path.join(tempDir, filename);

    const db = new DatabaseSync(sourcePath, { readOnly: true });
    try {
      await backup(db, destPath);
      await fsp.chmod(destPath, 0o600);
    } catch (error) {
      await fsp.rm(tempDir, { recursive: true, force: true });
      throw error;
    } finally {
      db.close();
    }

    return {
      kind: 'file',
      engine: 'sqlite',
      filename,
      mimeType: 'application/vnd.sqlite3',
      filePath: destPath,
      tempDir,
      cleanup: async () => {
        await fsp.rm(tempDir, { recursive: true, force: true });
      }
    };
  }
};
