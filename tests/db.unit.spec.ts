import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import mysqldump from 'mysqldump';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectDbEngineFromUrl, dumpDatabase, normalizeDbEngine, sanitizeFilenamePart, sanitizeUrl, SUPPORTED_DB_ENGINES } from '../src/db';

vi.mock('mysqldump', () => ({
  default: vi.fn()
}));

async function readStreamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function createFakeBinDir(bins: Record<string, string>): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'db-fake-bin-'));
  for (const [name, script] of Object.entries(bins)) {
    const filePath = path.join(dir, name);
    await fsp.writeFile(filePath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  }
  return dir;
}

describe('db backup architecture (unit)', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  describe('engine resolution & utilities', () => {
    it('normalizes canonical engines and aliases', () => {
      expect(SUPPORTED_DB_ENGINES).toEqual(['postgres', 'mysql', 'mongodb', 'sqlite']);
      expect(normalizeDbEngine('postgres')).toBe('postgres');
      expect(normalizeDbEngine('PG')).toBe('postgres');
      expect(normalizeDbEngine('postgresql')).toBe('postgres');
      expect(normalizeDbEngine('mysql')).toBe('mysql');
      expect(normalizeDbEngine('mariadb')).toBe('mysql');
      expect(normalizeDbEngine('mongodb')).toBe('mongodb');
      expect(normalizeDbEngine('mongo')).toBe('mongodb');
      expect(normalizeDbEngine('sqlite')).toBe('sqlite');
      expect(normalizeDbEngine('sqlite3')).toBe('sqlite');
      expect(() => normalizeDbEngine('oracle')).toThrow(/Unsupported database engine/);
    });

    it('detects engine from connection URL schemes', () => {
      expect(detectDbEngineFromUrl('postgres://u:p@localhost/app')).toBe('postgres');
      expect(detectDbEngineFromUrl('postgresql://u:p@localhost:5432/app')).toBe('postgres');
      expect(detectDbEngineFromUrl('mysql://u:p@localhost:3306/app')).toBe('mysql');
      expect(detectDbEngineFromUrl('mariadb://u:p@localhost:3306/app')).toBe('mysql');
      expect(detectDbEngineFromUrl('mongodb://u:p@localhost:27017/app')).toBe('mongodb');
      expect(detectDbEngineFromUrl('mongodb+srv://u:p@cluster.example.com/app')).toBe('mongodb');
      expect(detectDbEngineFromUrl('sqlite:///tmp/test.db')).toBe('sqlite');
      expect(detectDbEngineFromUrl('file:./local.db')).toBe('sqlite');
      expect(() => detectDbEngineFromUrl('http://example.com')).toThrow(/Could not detect database engine/);
    });

    it('sanitizes URLs and filename parts', () => {
      expect(sanitizeUrl('postgresql://admin:supersecret@db.internal:5432/prod')).toBe('postgresql://admin:***@db.internal:5432/prod');
      expect(sanitizeFilenamePart('my/prod db!')).toBe('my_prod_db');
      expect(sanitizeFilenamePart('___')).toBe('db');
    });

    it('throws if neither engine nor url nor DATABASE_URL is provided', async () => {
      vi.stubEnv('DATABASE_URL', '');
      await expect(dumpDatabase({})).rejects.toThrow(/Database engine not specified/);
    });
  });

  describe('SQLite provider (native node:sqlite)', () => {
    it('creates an online backup copy via node:sqlite and cleans up temp dir', async () => {
      const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'db-sqlite-src-'));
      tempDirs.push(workDir);
      const srcPath = path.join(workDir, 'app.sqlite');

      const srcDb = new DatabaseSync(srcPath);
      srcDb.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO items (name) VALUES ('backup-ok');");
      srcDb.close();

      const result = await dumpDatabase({ url: `sqlite://${srcPath}` });
      expect(result.kind).toBe('file');
      if (result.kind !== 'file') {
        throw new Error('Expected file result');
      }

      expect(result.engine).toBe('sqlite');
      expect(result.filename).toMatch(/^sqlite-app-\d{4}-\d{2}-\d{2}\.\d{6}\.sqlite$/);
      expect(fs.existsSync(result.filePath)).toBe(true);

      const copyDb = new DatabaseSync(result.filePath, { readOnly: true });
      const row = copyDb.prepare('SELECT name FROM items WHERE id = 1').get() as { name: string };
      copyDb.close();
      expect(row.name).toBe('backup-ok');

      await result.cleanup();
      expect(fs.existsSync(result.tempDir)).toBe(false);
    });

    it('rejects missing SQLite path or nonexistent file', async () => {
      vi.stubEnv('SQLITE_PATH', '');
      vi.stubEnv('DATABASE_URL', '');
      await expect(dumpDatabase({ engine: 'sqlite' })).rejects.toThrow(/Missing SQLite database path/);
      await expect(dumpDatabase({ engine: 'sqlite', database: '/nonexistent/path/db.sqlite' })).rejects.toThrow(/not found/);
    });
  });

  describe('PostgreSQL provider (pg_dump)', () => {
    it('fails clearly when pg_dump is not in PATH', async () => {
      vi.stubEnv('PATH', '');
      await expect(dumpDatabase({ engine: 'postgres', database: 'mydb' })).rejects.toThrow(/"pg_dump" not found in PATH/);
    });

    it('streams pg_dump output with password in PGPASSWORD env (never argv)', async () => {
      const binDir = await createFakeBinDir({
        pg_dump: 'echo "ARGS:$*"; echo "PWD:$PGPASSWORD"'
      });
      tempDirs.push(binDir);
      vi.stubEnv('PATH', binDir);

      const result = await dumpDatabase({
        url: 'postgresql://alice:s3cr3t@db.local:5432/analytics?sslmode=require',
        format: 'custom'
      });

      expect(result.kind).toBe('stream');
      if (result.kind !== 'stream') {
        throw new Error('Expected stream result');
      }
      expect(result.filename).toMatch(/^pgdump-analytics-.*\.dump$/);

      const output = await readStreamToString(result.stream);
      await result.wait();
      await result.cleanup();

      expect(output).toContain('--format=custom');
      expect(output).toContain('sslmode=require');
      expect(output).not.toContain('s3cr3t@');
      expect(output).toContain('PWD:s3cr3t');
    });

    it('propagates non-zero exit errors and sanitizes credentials in stderr', async () => {
      const binDir = await createFakeBinDir({
        pg_dump: 'echo "fatal: postgresql://u:topsecret@host/db refused" >&2; exit 2'
      });
      tempDirs.push(binDir);
      vi.stubEnv('PATH', binDir);

      const result = await dumpDatabase({ engine: 'postgres', database: 'prod' });
      expect(result.kind).toBe('stream');
      if (result.kind !== 'stream') {
        throw new Error('Expected stream result');
      }

      await expect(readStreamToString(result.stream)).rejects.toThrow(/exited with code 2.*postgresql:\/\/u:\*\*\*@host\/db/);
      await result.cleanup();
    });

    it('materializes stream to temp file when preferFile is true', async () => {
      const binDir = await createFakeBinDir({
        pg_dump: 'echo "-- pg dump content"'
      });
      tempDirs.push(binDir);
      vi.stubEnv('PATH', binDir);

      const result = await dumpDatabase({ engine: 'postgres', database: 'app', preferFile: true });
      expect(result.kind).toBe('file');
      if (result.kind !== 'file') {
        throw new Error('Expected file result');
      }
      expect(fs.readFileSync(result.filePath, 'utf8')).toContain('-- pg dump content');
      await result.cleanup();
      expect(fs.existsSync(result.tempDir)).toBe(false);
    });
  });

  describe('MySQL / MariaDB provider', () => {
    it('streams via mysqldump binary when available on PATH with MYSQL_PWD env', async () => {
      const binDir = await createFakeBinDir({
        mysqldump: 'echo "ARGS:$*"; echo "PWD:$MYSQL_PWD"'
      });
      tempDirs.push(binDir);
      vi.stubEnv('PATH', binDir);

      const result = await dumpDatabase({ url: 'mariadb://root:my%23pass@127.0.0.1:3307/shop' });
      expect(result.kind).toBe('stream');
      if (result.kind !== 'stream') {
        throw new Error('Expected stream result');
      }
      expect(result.filename).toMatch(/^mysqldump-shop-.*\.sql$/);

      const output = await readStreamToString(result.stream);
      await result.wait();
      await result.cleanup();

      expect(output).toContain('--single-transaction');
      expect(output).toContain('shop');
      expect(output).not.toContain('-pmy#pass');
      expect(output).toContain('PWD:my#pass');
    });

    it('falls back to pure-JS mysqldump package when CLI binary is unavailable', async () => {
      vi.stubEnv('PATH', '');
      vi.stubEnv('MYSQL_USER', 'root');
      vi.stubEnv('MYSQL_PASSWORD', 'secret');
      vi.stubEnv('MYSQL_DATABASE', 'appdb');

      vi.mocked(mysqldump).mockResolvedValueOnce({
        dump: { schema: '# header\nCREATE TABLE t (id INT);', data: 'INSERT INTO t VALUES (1);', trigger: null },
        tables: []
      } as never);

      const result = await dumpDatabase({ engine: 'mysql' });
      expect(result.kind).toBe('file');
      if (result.kind !== 'file') {
        throw new Error('Expected file result');
      }

      const content = fs.readFileSync(result.filePath, 'utf8');
      expect(content).toContain('-- header');
      expect(content).toContain('INSERT INTO t VALUES (1);');

      await result.cleanup();
      expect(fs.existsSync(result.tempDir)).toBe(false);
    });
  });

  describe('MongoDB provider (mongodump)', () => {
    it('fails clearly when mongodump is not in PATH', async () => {
      vi.stubEnv('PATH', '');
      await expect(dumpDatabase({ url: 'mongodb://localhost:27017/app' })).rejects.toThrow(/"mongodump" not found in PATH/);
    });

    it('streams --archive and passes URI via secure temp --config file cleaned up after exit', async () => {
      const binDir = await createFakeBinDir({
        mongodump:
          'echo "ARGS:$*"; for a in "$@"; do case "$a" in --config=*) while IFS= read -r l; do echo "$l"; done < "${a#--config=}";; esac; done'
      });
      tempDirs.push(binDir);
      vi.stubEnv('PATH', binDir);

      const result = await dumpDatabase({ url: 'mongodb+srv://mongoUser:mongoPass@cluster.local/orders' });
      expect(result.kind).toBe('stream');
      if (result.kind !== 'stream') {
        throw new Error('Expected stream result');
      }
      expect(result.filename).toMatch(/^mongodump-orders-.*\.archive$/);

      const output = await readStreamToString(result.stream);
      await result.wait();
      await result.cleanup();

      const configMatch = output.match(/--config=(\S+)/);
      expect(configMatch).not.toBeNull();
      expect(output).toContain('--archive');
      expect(output).not.toContain('ARGS:--archive mongodb+srv://');
      expect(output).toContain('uri: "mongodb+srv://mongoUser:mongoPass@cluster.local/orders"');
      // Temp config file must be cleaned up after dump completes
      expect(fs.existsSync(configMatch![1])).toBe(false);
    });
  });
});
