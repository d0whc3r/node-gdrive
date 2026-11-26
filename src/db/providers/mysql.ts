import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dayjs from 'dayjs';
import mysqldump from 'mysqldump';
import { findBinary, sanitizeFilenamePart, spawnDumpStream } from '../spawn';
import type { DbDumpFileResult, DbDumpOptions, DbDumpResult, DbProvider } from '../types';

function isMysqlUrl(value?: string): value is string {
  return Boolean(value && /^(?:mysql|mariadb):\/\//i.test(value));
}

interface MysqlConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function resolveMysqlConnection(options: DbDumpOptions, tag: string): MysqlConnection {
  const candidateUrl = options.url || (isMysqlUrl(process.env.DATABASE_URL) ? process.env.DATABASE_URL : undefined);

  if (candidateUrl) {
    const parsed = new URL(candidateUrl);
    const host = options.host || parsed.hostname || 'localhost';
    const port = options.port ?? (parsed.port ? Number(parsed.port) : 3306);
    const user = options.user || decodeURIComponent(parsed.username || '');
    const password = options.password ?? decodeURIComponent(parsed.password || '');
    const database = options.database || parsed.pathname.replace(/^\/+/, '');
    if (!user || !database) {
      throw new Error(`${tag} Invalid MySQL/MariaDB URL: username and database name are required.`);
    }
    return { host, port, user, password, database };
  }

  const host = options.host || process.env.MYSQL_HOST || 'localhost';
  const port = options.port ?? (process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306);
  const user = options.user || process.env.MYSQL_USER || '';
  const password = options.password ?? process.env.MYSQL_PASSWORD ?? '';
  const database = options.database || process.env.MYSQL_DATABASE || '';

  if (!user || !password || !database) {
    throw new Error(
      `${tag} Missing required MySQL environment variables ($MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT) or --db-url.`
    );
  }

  return { host, port, user, password, database };
}

async function dumpWithJsFallback(conn: MysqlConnection, filename: string): Promise<DbDumpFileResult> {
  const { dump } = await mysqldump({
    connection: {
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database: conn.database
    }
  });

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'db-mysql-'));
  await fsp.chmod(tempDir, 0o700);
  const filePath = path.join(tempDir, filename);
  const content = Object.values(dump)
    .filter((section): section is string => Boolean(section))
    .map((result) => result.replace(/^# /gm, '-- '))
    .join('\n\n');
  await fsp.writeFile(filePath, content, { mode: 0o600 });

  return {
    kind: 'file',
    engine: 'mysql',
    filename,
    mimeType: 'application/sql',
    filePath,
    tempDir,
    cleanup: async () => {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  };
}

export const mysqlProvider: DbProvider = {
  engine: 'mysql',
  aliases: ['mariadb'],

  async dump(options: DbDumpOptions): Promise<DbDumpResult> {
    const tag = options.tag ?? '[db]';
    const conn = resolveMysqlConnection(options, tag);
    const filename = options.filename || `mysqldump-${sanitizeFilenamePart(conn.database)}-${dayjs().format('YYYY-MM-DD.HHmmss')}.sql`;

    const binary = findBinary(['mysqldump', 'mariadb-dump']);
    if (!binary) {
      return dumpWithJsFallback(conn, filename);
    }

    const args: string[] = [
      '--single-transaction',
      '--quick',
      '--routines',
      '--triggers',
      '-h',
      conn.host,
      '-P',
      String(conn.port),
      '-u',
      conn.user,
      ...(options.extraArgs ?? []),
      conn.database
    ];

    const env: NodeJS.ProcessEnv = {};
    if (conn.password) {
      // MYSQL_PWD keeps the password out of argv / process listings
      env.MYSQL_PWD = conn.password;
    }

    return spawnDumpStream({
      engine: 'mysql',
      binary,
      args,
      env,
      filename,
      mimeType: 'application/sql',
      tag,
      installHint: 'Install mariadb-client / mysql-client or use the :db Docker image.'
    });
  }
};
