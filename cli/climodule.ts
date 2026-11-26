import path from 'node:path';
import type { Readable } from 'node:stream';
import { styleText } from 'node:util';
import { dumpDatabase, GDrive } from '../src';
import Config from '../src/config';
import type { Logger, Schema$File$Modded } from '../src/types';
import { GDriveOptions, getUsageGuide, getVersion } from './cliconfig';

function createCliLogger(quiet: boolean): Logger {
  if (!quiet) {
    return console;
  }
  return {
    info: () => {},
    warn: () => {},
    error: (...args: unknown[]) => console.error(...args)
  };
}

export class Cli {
  private readonly logger: Logger;
  private readonly gdrive: GDrive;

  constructor(
    private readonly opts: GDriveOptions,
    gdrive?: GDrive,
    logger?: Logger
  ) {
    const silentLogs = Boolean(opts.quiet || opts.json);
    this.logger = logger ?? createCliLogger(silentLogs);
    this.gdrive =
      gdrive ??
      new GDrive({
        sharedDriveId: opts['drive-id'],
        serviceAccountFile: opts['service-account'],
        dryRun: opts['dry-run'],
        logger: this.logger
      });
  }

  private getEncryptionKey(): string | undefined {
    if (!this.opts.encrypt) {
      return undefined;
    }
    const key = Config.BACKUP_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(`${Config.TAG} --encrypt requires BACKUP_ENCRYPTION_KEY environment variable to be set.`);
    }
    return key;
  }

  async parseOptions(stdinStream: Readable = process.stdin): Promise<void> {
    if (this.opts.version) {
      console.info(getVersion());
      return;
    }

    if (this.opts.help || Object.keys(this.opts).length === 0) {
      console.info(getUsageGuide());
      return;
    }

    const zip = this.opts.zip;
    const folder = this.opts.folder;
    const replace = this.opts.replace;
    const create = this.opts.create;
    const dryRun = this.opts['dry-run'];
    const exclude = this.opts.exclude;

    if (this.opts.list) {
      await this.showList();
    }
    if (this.opts.backup) {
      await this.backup(this.opts.backup, { zip, folder, replace, create, dryRun, exclude });
    }
    if (this.opts.stdin) {
      await this.uploadFromStdin(stdinStream, this.opts.name!, { folder, replace, create, dryRun });
    }
    if (this.opts.download) {
      await this.download(this.opts.download, this.opts.output, folder);
    }
    if (this.opts.delete) {
      await this.delete(this.opts.delete, folder, { dryRun, keepLast: this.opts['keep-last'] });
    }
    if (this.opts.db || this.opts['db-url']) {
      await this.backupDatabase({ zip, folder, replace, create, dryRun });
    } else if (this.opts.mysql) {
      await this.dumpMysql({ zip, folder, replace, create, dryRun });
    }
  }

  async showList(): Promise<Schema$File$Modded[]> {
    const files = (await this.gdrive.listFiles()).filter((file) => !file.isDeleted);
    if (this.opts.json) {
      console.info(JSON.stringify(files, null, 2));
      return files;
    }
    if (files.length) {
      this.logger.info(`${Config.TAG} File list: ${files.length}`);
      this.beautifulFiles(files);
    } else {
      this.logger.info(`${Config.TAG} No files found.`);
    }
    return files;
  }

  async delete(args: string | string[], folder?: string, options: { dryRun?: boolean; keepLast?: number } = {}): Promise<Schema$File$Modded[]> {
    const list = Array.isArray(args) ? args : [args];
    const parsed = list.map((x) => {
      const item = this.parseDelete(x);
      return {
        folder: item.folder ?? folder ?? undefined,
        timeSpace: item.timeSpace
      };
    });

    const removedBatches = await Promise.all(
      parsed.map((info) =>
        this.gdrive.cleanOlder(info.timeSpace, info.folder, {
          dryRun: options.dryRun,
          keepLast: options.keepLast
        })
      )
    );
    const deleted = removedBatches.flat();

    if (this.opts.json) {
      console.info(JSON.stringify(deleted, null, 2));
    }
    return deleted;
  }

  async backup(
    files: string | string[],
    opts: { zip?: string | null; folder?: string; replace?: boolean; create?: boolean; dryRun?: boolean; exclude?: string[] }
  ): Promise<Record<string, Schema$File$Modded>> {
    const { zip, folder, replace, create, dryRun, exclude } = opts;
    const encryptKey = this.getEncryptionKey();
    const list = Array.isArray(files) ? files : [files];
    const uploaded = await this.gdrive.uploadFiles(list, folder || false, {
      compress: zip || zip === null,
      replace,
      create,
      dryRun,
      encryptKey,
      exclude
    });
    if (this.opts.json) {
      console.info(JSON.stringify(uploaded, null, 2));
    }
    return uploaded;
  }

  async uploadFromStdin(
    stream: Readable,
    fileName: string,
    opts: { folder?: string; replace?: boolean; create?: boolean; dryRun?: boolean }
  ): Promise<Schema$File$Modded> {
    const encryptKey = this.getEncryptionKey();
    const uploaded = await this.gdrive.uploadStream(stream, fileName, opts.folder || false, {
      replace: opts.replace,
      create: opts.create,
      dryRun: opts.dryRun,
      encryptKey
    });
    if (this.opts.json) {
      console.info(JSON.stringify(uploaded, null, 2));
    }
    return uploaded;
  }

  async download(fileIdOrName: string, outputPath?: string, folderName?: string): Promise<string> {
    const decryptKey = this.getEncryptionKey();
    const defaultOutput = decryptKey && fileIdOrName.endsWith('.enc') ? fileIdOrName.slice(0, -4) : path.basename(fileIdOrName);
    const destPath = outputPath ?? defaultOutput;
    const saved = await this.gdrive.downloadFile(fileIdOrName, destPath, {
      decryptKey,
      folderName
    });
    if (this.opts.json) {
      console.info(JSON.stringify({ downloaded: saved }, null, 2));
    } else {
      this.logger.info(`${Config.TAG} Downloaded to ${saved}`);
    }
    return saved;
  }

  async backupDatabase(opts: {
    engine?: string;
    url?: string;
    format?: 'plain' | 'custom' | 'tar';
    zip?: string | null;
    folder?: string;
    replace?: boolean;
    create?: boolean;
    dryRun?: boolean;
  }): Promise<Schema$File$Modded | Record<string, Schema$File$Modded>> {
    const engine = opts.engine ?? this.opts.db ?? (this.opts.mysql ? 'mysql' : undefined);
    const url = opts.url ?? this.opts['db-url'];
    const format = opts.format ?? this.opts['db-format'];
    const wantsZip = Boolean(opts.zip || opts.zip === null);

    const dump = await dumpDatabase({
      engine,
      url,
      format,
      preferFile: wantsZip,
      filename: this.opts.name,
      tag: Config.TAG
    });

    try {
      if (dump.kind === 'stream') {
        const encryptKey = this.getEncryptionKey();
        const uploaded = await this.gdrive.uploadStream(dump.stream, dump.filename, opts.folder || false, {
          replace: opts.replace,
          create: opts.create,
          dryRun: opts.dryRun,
          encryptKey,
          mimeType: dump.mimeType
        });
        await dump.wait();
        if (this.opts.json) {
          console.info(JSON.stringify(uploaded, null, 2));
        }
        return uploaded;
      }

      return await this.backup(dump.filePath, opts);
    } finally {
      await dump.cleanup();
    }
  }

  async dumpMysql(opts: {
    zip?: string | null;
    folder?: string;
    replace?: boolean;
    create?: boolean;
    dryRun?: boolean;
  }): Promise<Schema$File$Modded | Record<string, Schema$File$Modded>> {
    return this.backupDatabase({ ...opts, engine: 'mysql' });
  }

  private parseDelete(arg: string): { folder: string | null; timeSpace: string } {
    const idx = arg.lastIndexOf('=');
    if (idx > 0) {
      return {
        folder: arg.slice(0, idx),
        timeSpace: arg.slice(idx + 1)
      };
    }
    return {
      folder: null,
      timeSpace: arg
    };
  }

  private beautifulFiles(files: Schema$File$Modded[]): void {
    const idToName = new Map<string, string>();
    for (const file of files) {
      if (file.id && file.name) {
        idToName.set(file.id, file.name);
      }
    }

    const parsed = files.map((file) => {
      const parentId = file.parents?.[0];
      return {
        ...file,
        parentFolder: parentId ? idToName.get(parentId) : undefined
      } as Schema$File$Modded;
    });

    parsed.sort((a, b) => {
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }
      const aHasParent = Boolean(a.parentFolder);
      const bHasParent = Boolean(b.parentFolder);
      if (aHasParent !== bHasParent) {
        return aHasParent ? -1 : 1;
      }
      if (a.parentFolder && b.parentFolder && a.parentFolder !== b.parentFolder) {
        return a.parentFolder.localeCompare(b.parentFolder);
      }
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

    for (const file of parsed) {
      const fileName = file.isFolder ? this.showFolder(file.name) : file.name;
      const parent = file.parentFolder ? this.showFolder(`${file.parentFolder}/`) : '';
      this.logger.info(`${parent}${fileName || ''}`);
    }
  }

  private showFolder(name?: string | null): string {
    if (!name) {
      return '';
    }
    return styleText(['bold', 'cyan'], name);
  }
}
