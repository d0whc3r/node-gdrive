import dayjs from 'dayjs';
import { findBinary, sanitizeFilenamePart, spawnDumpStream } from '../spawn';
import type { DbDumpOptions, DbDumpResult, DbProvider, PostgresFormat } from '../types';

const POSTGRES_FORMATS: Record<PostgresFormat, { ext: string; mimeType: string }> = {
  plain: { ext: 'sql', mimeType: 'application/sql' },
  custom: { ext: 'dump', mimeType: 'application/octet-stream' },
  tar: { ext: 'tar', mimeType: 'application/x-tar' }
};

function isPostgresUrl(value?: string): value is string {
  return Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
}

function parsePostgresUrl(rawUrl: string): {
  sanitizedDbNameArg: string;
  password?: string;
  database: string;
} {
  const parsed = new URL(rawUrl);
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
  const database = parsed.pathname.replace(/^\/+/, '') || 'postgres';
  // Remove password from URI passed on argv so it is never exposed in `ps`
  parsed.password = '';
  return {
    sanitizedDbNameArg: parsed.toString(),
    password,
    database
  };
}

export const postgresProvider: DbProvider = {
  engine: 'postgres',
  aliases: ['pg', 'postgresql'],

  async dump(options: DbDumpOptions): Promise<DbDumpResult> {
    const tag = options.tag ?? '[db]';
    const format: PostgresFormat = options.format ?? 'plain';
    const formatInfo = POSTGRES_FORMATS[format];
    if (!formatInfo) {
      throw new Error(`${tag} Unsupported PostgreSQL dump format "${String(format)}". Expected one of: plain, custom, tar.`);
    }

    const binary = findBinary(['pg_dump']);
    if (!binary) {
      throw new Error(
        `${tag} "pg_dump" not found in PATH. Install postgresql-client (e.g. apt install postgresql-client / brew install libpq) or use the :db Docker image.`
      );
    }

    const candidateUrl = options.url || (isPostgresUrl(process.env.DATABASE_URL) ? process.env.DATABASE_URL : undefined);
    const args: string[] = ['--no-password', `--format=${format}`];
    const env: NodeJS.ProcessEnv = {};
    let dbName: string;

    if (candidateUrl) {
      const parsed = parsePostgresUrl(candidateUrl);
      dbName = options.database || parsed.database;
      if (options.password ?? parsed.password) {
        env.PGPASSWORD = options.password ?? parsed.password;
      }
      args.push(`--dbname=${parsed.sanitizedDbNameArg}`);
    } else {
      const host = options.host || process.env.PGHOST || 'localhost';
      const port = options.port ?? (process.env.PGPORT ? Number(process.env.PGPORT) : 5432);
      const user = options.user || process.env.PGUSER || '';
      const password = options.password ?? process.env.PGPASSWORD;
      const database = options.database || process.env.PGDATABASE || '';

      if (!database) {
        throw new Error(`${tag} Missing PostgreSQL database configuration. Set $PGDATABASE (or $DATABASE_URL / --db-url).`);
      }

      dbName = database;
      env.PGHOST = host;
      env.PGPORT = String(port);
      if (user) {
        env.PGUSER = user;
      }
      if (password !== undefined && password !== '') {
        env.PGPASSWORD = password;
      }
      env.PGDATABASE = database;
    }

    if (options.extraArgs?.length) {
      args.push(...options.extraArgs);
    }

    const filename = options.filename || `pgdump-${sanitizeFilenamePart(dbName)}-${dayjs().format('YYYY-MM-DD.HHmmss')}.${formatInfo.ext}`;

    return spawnDumpStream({
      engine: 'postgres',
      binary,
      args,
      env,
      filename,
      mimeType: formatInfo.mimeType,
      tag,
      installHint: 'Install postgresql-client or use the :db Docker image.'
    });
  }
};
