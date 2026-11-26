import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dayjs from 'dayjs';
import { findBinary, sanitizeFilenamePart, spawnDumpStream } from '../spawn';
import type { DbDumpOptions, DbDumpResult, DbProvider } from '../types';

function isMongoUrl(value?: string): value is string {
  return Boolean(value && /^mongodb(?:\+srv)?:\/\//i.test(value));
}

function escapeYamlString(value: string): string {
  return JSON.stringify(value);
}

export const mongodbProvider: DbProvider = {
  engine: 'mongodb',
  aliases: ['mongo'],

  async dump(options: DbDumpOptions): Promise<DbDumpResult> {
    const tag = options.tag ?? '[db]';
    const binary = findBinary(['mongodump']);
    if (!binary) {
      throw new Error(`${tag} "mongodump" not found in PATH. Install mongodb-database-tools or use the :db Docker image.`);
    }

    const candidateUrl = options.url || process.env.MONGODB_URI || (isMongoUrl(process.env.DATABASE_URL) ? process.env.DATABASE_URL : undefined);
    const args: string[] = ['--archive'];
    let dbLabel = 'mongodb';
    let configYaml = '';

    if (candidateUrl) {
      let parsedDb = '';
      try {
        const parsed = new URL(candidateUrl);
        parsedDb = parsed.pathname.replace(/^\/+/, '');
      } catch {
        // Keep default label if URL is a non-standard mongodb seed list
      }
      dbLabel = options.database || parsedDb || 'mongodb';
      configYaml = `uri: ${escapeYamlString(candidateUrl)}\n`;
      if (options.database) {
        args.push('--db', options.database);
      }
    } else {
      const host = options.host || process.env.MONGO_HOST || 'localhost';
      const port = options.port ?? (process.env.MONGO_PORT ? Number(process.env.MONGO_PORT) : 27017);
      const user = options.user || process.env.MONGO_USER || '';
      const password = options.password ?? process.env.MONGO_PASSWORD ?? '';
      const database = options.database || process.env.MONGO_DATABASE || '';
      const authDb = process.env.MONGO_AUTH_DB || '';

      if (!database && !options.host && !process.env.MONGO_HOST) {
        throw new Error(`${tag} Missing MongoDB configuration. Set $MONGODB_URI (or $MONGO_DATABASE / $MONGO_HOST / --db-url).`);
      }

      dbLabel = database || 'all';
      args.push('--host', host, '--port', String(port));
      if (database) {
        args.push('--db', database);
      }
      if (user) {
        args.push('--username', user);
      }
      if (authDb) {
        args.push('--authenticationDatabase', authDb);
      }
      if (password) {
        configYaml = `password: ${escapeYamlString(password)}\n`;
      }
    }

    let tempConfigDir: string | undefined;
    if (configYaml) {
      tempConfigDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'db-mongo-cfg-'));
      await fsp.chmod(tempConfigDir, 0o700);
      const configPath = path.join(tempConfigDir, 'mongodump.conf');
      await fsp.writeFile(configPath, configYaml, { mode: 0o600 });
      args.push(`--config=${configPath}`);
    }

    if (options.extraArgs?.length) {
      args.push(...options.extraArgs);
    }

    const filename = options.filename || `mongodump-${sanitizeFilenamePart(dbLabel)}-${dayjs().format('YYYY-MM-DD.HHmmss')}.archive`;

    return spawnDumpStream({
      engine: 'mongodb',
      binary,
      args,
      filename,
      mimeType: 'application/octet-stream',
      tag,
      installHint: 'Install mongodb-database-tools or use the :db Docker image.',
      onCleanup: async () => {
        if (tempConfigDir) {
          await fsp.rm(tempConfigDir, { recursive: true, force: true });
        }
      }
    });
  }
};
