import type { Readable } from 'node:stream';

export type DbEngine = 'postgres' | 'mysql' | 'mongodb' | 'sqlite';

export type PostgresFormat = 'plain' | 'custom' | 'tar';

export interface DbDumpOptions {
  /** Target database engine. Auto-detected from `url` when omitted. */
  engine?: DbEngine | string;
  /** Connection URI (e.g. postgresql://..., mysql://..., mongodb://..., sqlite:///path/to.db). */
  url?: string;
  /** Database host (overrides engine env vars). */
  host?: string;
  /** Database port (overrides engine env vars). */
  port?: number;
  /** Database user (overrides engine env vars). */
  user?: string;
  /** Database password (overrides engine env vars). */
  password?: string;
  /** Database name (or file path for SQLite). */
  database?: string;
  /** Output format for PostgreSQL (`plain`, `custom`, `tar`). Defaults to `plain`. */
  format?: PostgresFormat;
  /** Materialize stream output into a temporary file (e.g. when zipping). */
  preferFile?: boolean;
  /** Optional custom filename for the resulting dump. */
  filename?: string;
  /** Extra CLI flags passed to the underlying dump binary. */
  extraArgs?: string[];
  /** Log/error tag prefix (e.g. `[node-s3]`). */
  tag?: string;
}

export interface DbDumpStreamResult {
  kind: 'stream';
  engine: DbEngine;
  filename: string;
  mimeType: string;
  stream: Readable;
  /** Resolves when the dump process exits with code 0; rejects otherwise. */
  wait: () => Promise<void>;
  /** Terminates any active process and removes temporary resources. */
  cleanup: () => Promise<void>;
}

export interface DbDumpFileResult {
  kind: 'file';
  engine: DbEngine;
  filename: string;
  mimeType: string;
  filePath: string;
  tempDir: string;
  /** Removes the temporary directory containing the dump file. */
  cleanup: () => Promise<void>;
}

export type DbDumpResult = DbDumpStreamResult | DbDumpFileResult;

export interface DbProvider {
  readonly engine: DbEngine;
  readonly aliases: readonly string[];
  dump(options: DbDumpOptions): Promise<DbDumpResult>;
}
