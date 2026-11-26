import fs, { ReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { drive as createDriveClient, drive_v3 } from '@googleapis/drive';
import { ZipArchive } from 'archiver';
import dayjs, { ManipulateType } from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import type { GoogleAuth, OAuth2Client } from 'google-auth-library';
import mime from 'mime-types';
import Auth from './auth';
import Config from './config';
import { decryptBuffer, decryptFile, encryptBuffer, encryptFile } from './crypto';
import { isRetryableError, withRetry } from './retry';
import {
  allFileTypes,
  CleanOlderOptions,
  DownloadOptions,
  FieldsType,
  GDriveConfig,
  Logger,
  Params$Resource$Files$Create,
  Params$Resource$Files$Get,
  Params$Resource$Files$List,
  RetryOptions,
  Schema$File$Modded,
  UploadOptions,
  UploadOptionsBasic,
  UploadProgressEvent,
  UploadStreamOptions
} from './types';

dayjs.extend(isSameOrBefore);

const VALID_FIELDS = new Set<string>(allFileTypes);

const TIME_SPACE_REGEX = /^(\d+)([a-zA-Z]+)$/;

const TIME_UNIT_MAP: Record<string, ManipulateType> = {
  s: 'second',
  second: 'second',
  seconds: 'second',
  m: 'minute',
  minute: 'minute',
  minutes: 'minute',
  h: 'hour',
  hour: 'hour',
  hours: 'hour',
  d: 'day',
  day: 'day',
  days: 'day',
  w: 'week',
  week: 'week',
  weeks: 'week',
  M: 'month',
  month: 'month',
  months: 'month',
  y: 'year',
  year: 'year',
  years: 'year'
};

export function escapeDriveQuery(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

export function parseTimeSpace(timeSpace: string): { amount: number; unit: ManipulateType } {
  const match = TIME_SPACE_REGEX.exec(timeSpace);
  const unit = match ? TIME_UNIT_MAP[match[2]] : undefined;
  if (!match || !unit) {
    throw new Error(
      `${Config.TAG} Invalid timeSpace "${timeSpace}". Expected "<number><unit>" where unit is one of: s, m, h, d, w, M, y, second(s), minute(s), hour(s), day(s), week(s), month(s), year(s).`
    );
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${Config.TAG} Invalid timeSpace "${timeSpace}": amount must be a positive integer.`);
  }
  return { amount, unit };
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = Array.from({ length: items.length });
  let nextIndex = 0;

  async function next(): Promise<void> {
    if (nextIndex >= items.length) {
      return;
    }
    const currentIndex = nextIndex;
    nextIndex += 1;
    results[currentIndex] = await worker(items[currentIndex]);
    await next();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

export class GDrive {
  public readonly DEFAULT_FIELDS: FieldsType[] = ['createdTime', 'id', 'md5Checksum', 'mimeType', 'name', 'parents', 'trashed'];
  private readonly MIME_FOLDER = 'application/vnd.google-apps.folder';
  private readonly gdriveAuth?: Auth;
  private readonly injectedAuth?: OAuth2Client | GoogleAuth;
  private readonly sharedDriveId?: string;
  private readonly defaultDryRun: boolean;
  private readonly defaultConcurrency: number;
  private readonly defaultCompressionLevel: number;
  private readonly defaultOnProgress?: (event: UploadProgressEvent) => void;
  private readonly retryOptions: RetryOptions;
  private readonly logger: Logger;
  private _drive?: drive_v3.Drive;
  private _initPromise?: Promise<boolean>;

  constructor(config: GDriveConfig = {}) {
    this.logger = config.logger ?? console;
    this.sharedDriveId = config.sharedDriveId;
    this.defaultDryRun = config.dryRun ?? false;
    this.defaultConcurrency = config.concurrency ?? 4;
    this.defaultCompressionLevel = config.compressionLevel ?? 6;
    this.defaultOnProgress = config.onProgress;
    this.retryOptions = config.retry ?? {};

    if (config.drive) {
      this._drive = config.drive;
    }
    if (config.auth) {
      this.injectedAuth = config.auth;
    }
    if (!config.drive && !config.auth) {
      this.gdriveAuth = new Auth({
        credentialsFile: config.credentialsFile,
        tokenFile: config.tokenFile,
        serviceAccountFile: config.serviceAccountFile,
        useADC: config.useADC,
        scopes: config.scopes,
        logger: this.logger
      });
    }
  }

  private ensureInitiated(): Promise<boolean> {
    if (this._drive || this.injectedAuth) {
      return Promise.resolve(true);
    }
    if (!this._initPromise) {
      this._initPromise = this.gdriveAuth!.initiate().catch((err: unknown) => {
        this._initPromise = undefined;
        throw err;
      });
    }
    return this._initPromise;
  }

  private get auth(): OAuth2Client | GoogleAuth {
    if (this.injectedAuth) {
      return this.injectedAuth;
    }
    return this.gdriveAuth!.getAuthClient();
  }

  private get drive(): drive_v3.Drive {
    if (!this._drive) {
      this._drive = createDriveClient({ version: 'v3', auth: this.auth });
    }
    return this._drive;
  }

  private get sharedDriveListParams(): Partial<Params$Resource$Files$List> {
    if (!this.sharedDriveId) {
      return {};
    }
    return {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'drive',
      driveId: this.sharedDriveId
    };
  }

  private get sharedDriveItemParams(): { supportsAllDrives?: boolean } {
    return this.sharedDriveId ? { supportsAllDrives: true } : {};
  }

  private get rootParentId(): string {
    return this.sharedDriveId ?? 'root';
  }

  public isFolder(file: drive_v3.Schema$File): boolean | undefined {
    if (Object.hasOwn(file, 'mimeType')) {
      return file.mimeType === this.MIME_FOLDER;
    }
    return undefined;
  }

  public isDeleted(file: drive_v3.Schema$File): boolean {
    if (Object.hasOwn(file, 'trashed')) {
      return !!file.trashed;
    }
    return false;
  }

  async listFiles(fields?: boolean | FieldsType[], pageSize = 1000, q?: string): Promise<Schema$File$Modded[]> {
    await this.ensureInitiated();
    let selectedFields: readonly FieldsType[];
    if (!fields) {
      selectedFields = this.DEFAULT_FIELDS;
    } else if (fields === true) {
      selectedFields = allFileTypes;
    } else {
      for (const field of fields) {
        if (!VALID_FIELDS.has(field)) {
          throw new Error(`${Config.TAG} Invalid Drive file field: "${field}"`);
        }
      }
      selectedFields = fields;
    }

    const info: Params$Resource$Files$List = {
      pageSize,
      fields: `kind, nextPageToken, incompleteSearch, files(${selectedFields.join(', ')})`,
      prettyPrint: false,
      ...this.sharedDriveListParams
    };
    if (q) {
      info.q = q;
    }
    return this.getListFiles(info);
  }

  async getFile(fileId?: string | null): Promise<drive_v3.Schema$File> {
    await this.ensureInitiated();
    if (!fileId) {
      throw this.genericError(new Error(`${Config.TAG} File id not found`));
    }
    const info: Params$Resource$Files$Get = {
      fileId,
      ...this.sharedDriveItemParams
    };
    try {
      const { data } = await withRetry(() => this.drive.files.get(info), this.retryOptions);
      return data;
    } catch (err) {
      throw this.genericError(err);
    }
  }

  private async resolveDownloadFileId(fileIdOrName: string, folderName?: string): Promise<string> {
    if (folderName) {
      const folderId = await this.findFolderId(folderName, false);
      const found = await this.findFile(fileIdOrName, folderId);
      if (!found?.id) {
        throw new Error(`${Config.TAG} File "${fileIdOrName}" not found in folder "${folderName}"`);
      }
      return found.id;
    }

    try {
      const meta = await withRetry(
        () =>
          this.drive.files.get({
            fileId: fileIdOrName,
            fields: 'id, name, mimeType',
            ...this.sharedDriveItemParams
          }),
        this.retryOptions
      );
      return meta.data.id ?? fileIdOrName;
    } catch {
      const found = await this.findFile(fileIdOrName);
      if (!found?.id) {
        throw new Error(`${Config.TAG} File "${fileIdOrName}" not found`);
      }
      return found.id;
    }
  }

  async downloadFile(fileIdOrName: string, destPath: string, options: DownloadOptions = {}): Promise<string> {
    await this.ensureInitiated();
    if (!fileIdOrName) {
      throw new Error(`${Config.TAG} File id or name is required for download`);
    }

    const resolvedFileId = await this.resolveDownloadFileId(fileIdOrName, options.folderName);

    fs.mkdirSync(path.dirname(path.resolve(destPath)), { recursive: true });

    let tempDir: string | undefined;
    let downloadTarget = destPath;
    if (options.decryptKey) {
      tempDir = this.createPrivateTempDir();
      downloadTarget = path.join(tempDir, 'download.enc');
    }

    try {
      const response = await withRetry(
        () =>
          this.drive.files.get(
            {
              fileId: resolvedFileId,
              alt: 'media',
              ...this.sharedDriveItemParams
            },
            { responseType: 'stream' }
          ),
        this.retryOptions
      );

      const writeStream = fs.createWriteStream(downloadTarget, { mode: options.decryptKey ? 0o600 : 0o644 });
      await pipeline(response.data as unknown as Readable, writeStream);

      if (options.decryptKey) {
        await decryptFile(downloadTarget, destPath, options.decryptKey);
      }

      return destPath;
    } catch (err) {
      if (!options.decryptKey) {
        fs.rmSync(destPath, { force: true });
      }
      throw this.genericError(err);
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  async emptyTrash(): Promise<{ status: number; data: unknown }> {
    await this.ensureInitiated();
    return withRetry(() => this.drive.files.emptyTrash(), this.retryOptions);
  }

  async deleteFile(file: Schema$File$Modded): Promise<unknown> {
    await this.ensureInitiated();
    if (!file.id) {
      return undefined;
    }
    try {
      const { data } = await withRetry(
        () =>
          this.drive.files.delete({
            fileId: file.id!,
            ...this.sharedDriveItemParams
          }),
        this.retryOptions
      );
      if (file.name) {
        this.logger.warn(`${Config.TAG} Deleted ${file.isFolder ? 'folder' : 'file'}: ${file.name}`);
      }
      return data;
    } catch (err) {
      throw this.genericError(err);
    }
  }

  async uploadFile(file: string, folderName?: string | boolean, options: UploadOptionsBasic = {}): Promise<Schema$File$Modded> {
    await this.ensureInitiated();
    const { create = true, replace = false, encryptKey } = options;
    const dryRun = options.dryRun ?? this.defaultDryRun;
    const onProgress = options.onProgress ?? this.defaultOnProgress;

    const originalName = path.basename(file);
    const uploadName = encryptKey && !originalName.endsWith('.enc') ? `${originalName}.enc` : originalName;
    const mimeType = encryptKey ? 'application/octet-stream' : mime.contentType(originalName) || undefined;
    const requestBody: drive_v3.Schema$File = {
      name: uploadName,
      mimeType
    };

    const folderId = await this.getUploadFolderId(folderName || false, create, requestBody, dryRun);

    if (dryRun) {
      this.logger.info(
        `${Config.TAG} [dry-run] Would upload "${uploadName}"${folderName && typeof folderName === 'string' ? ` to "${folderName}"` : ''}`
      );
      return this.parseFileMeta(requestBody);
    }

    await this.replaceExistingFile(replace, uploadName, folderId);

    let tempDir: string | undefined;
    let fileToUpload = file;
    if (encryptKey) {
      tempDir = this.createPrivateTempDir();
      fileToUpload = path.join(tempDir, uploadName);
      await encryptFile(file, fileToUpload, encryptKey);
    }

    try {
      const fileSize = fs.statSync(fileToUpload).size;
      const { data } = await withRetry(async () => {
        const readStream = fs.createReadStream(fileToUpload);
        readStream.on('error', (err) => {
          this.logger.error(`${Config.TAG} Read stream error for "${fileToUpload}":`, err);
        });

        const createOptions: Params$Resource$Files$Create = {
          requestBody,
          media: {
            body: readStream
          },
          fields: `kind, ${this.DEFAULT_FIELDS.join(', ')}`,
          ...this.sharedDriveItemParams
        };

        const onUploadProgress = (evt: { bytesRead: number }) => {
          const percentage = fileSize === 0 ? 100 : Math.min(100, (evt.bytesRead / fileSize) * 100);
          onProgress?.({
            fileName: uploadName,
            bytesRead: evt.bytesRead,
            totalBytes: fileSize,
            percentage
          });
          if (percentage >= 100) {
            this.logger.warn(`${Config.TAG} Upload ${uploadName}: ${Math.round(percentage)}% complete`);
          }
        };

        try {
          return await this.drive.files.create(createOptions, { onUploadProgress });
        } finally {
          readStream.destroy();
        }
      }, this.retryOptions);

      return this.parseFileMeta(data);
    } catch (err) {
      throw this.genericError(err);
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  async uploadStream(
    stream: Readable,
    fileName: string,
    folderName?: string | boolean,
    options: UploadStreamOptions = {}
  ): Promise<Schema$File$Modded> {
    await this.ensureInitiated();
    const safeName = this.sanitizeFilename(fileName);
    const tempDir = this.createPrivateTempDir();
    const tempFile = path.join(tempDir, safeName);

    try {
      const writeStream = fs.createWriteStream(tempFile, { mode: 0o600 });
      await pipeline(stream, writeStream);
      return await this.uploadFile(tempFile, folderName, options);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async uploadFiles(
    files: string | string[],
    folderName?: string | boolean,
    options: UploadOptions = {}
  ): Promise<Record<string, Schema$File$Modded>> {
    await this.ensureInitiated();
    const { compress, replace, create, dryRun, encryptKey, onProgress, exclude, followSymlinks = false } = options;
    const concurrency = options.concurrency ?? this.defaultConcurrency;
    const compressionLevel = options.compressionLevel ?? this.defaultCompressionLevel;

    const inputList = Array.isArray(files) ? files : [files];
    const resolvedFiles = this.expandFileInputs(inputList, { exclude, followSymlinks });

    let tempZipDir: string | undefined;
    let filesToUpload = resolvedFiles;

    try {
      if (compress) {
        const zipName = typeof compress === 'string' ? compress : `zipped_${dayjs().format('YYYY-MM-DD.HHmmss')}.zip`;
        const { zipPath, tempDir } = await this.compressFiles(resolvedFiles, zipName, {
          compressionLevel,
          followSymlinks
        });
        tempZipDir = tempDir;
        filesToUpload = [zipPath];
      }

      if (folderName && typeof folderName === 'string' && filesToUpload.length > 0 && !(dryRun ?? this.defaultDryRun)) {
        await this.findFolderId(folderName, create ?? true);
      }

      const result: Record<string, Schema$File$Modded> = {};
      await runWithConcurrency(filesToUpload, concurrency, async (file) => {
        const uploaded = await this.uploadFile(file, folderName, {
          replace,
          create,
          dryRun,
          encryptKey,
          onProgress
        });
        const key = uploaded.name || path.basename(file);
        result[key] = uploaded;
      });

      return result;
    } finally {
      if (tempZipDir) {
        fs.rmSync(tempZipDir, { recursive: true, force: true });
      }
    }
  }

  async cleanOlder(timeSpace: string, folderName?: string, options: CleanOlderOptions = {}): Promise<Schema$File$Modded[]> {
    const { amount, unit } = parseTimeSpace(timeSpace);
    await this.ensureInitiated();

    let folderId = '';
    if (folderName) {
      folderId = await this.findFolderId(folderName, false);
    }
    return this.deleteOlder(amount, unit, folderId, options);
  }

  private expandFileInputs(inputs: string[], opts: { exclude?: string[]; followSymlinks?: boolean }): string[] {
    const { exclude = [], followSymlinks = false } = opts;
    const collected: string[] = [];

    const visit = (entry: string) => {
      if (entry.includes('*')) {
        const matched = fs.globSync(entry, { exclude });
        for (const item of matched) {
          visit(item);
        }
        return;
      }
      if (exclude.some((pattern) => path.matchesGlob(entry, pattern) || path.matchesGlob(path.basename(entry), pattern))) {
        return;
      }
      const lstat = fs.lstatSync(entry);
      if (lstat.isSymbolicLink() && !followSymlinks) {
        this.logger.warn(`${Config.TAG} Skipping symlink: ${entry}`);
        return;
      }
      const stat = lstat.isSymbolicLink() ? fs.statSync(entry) : lstat;
      if (stat.isDirectory()) {
        const children = fs.readdirSync(entry).map((child) => path.join(entry, child));
        for (const child of children) {
          visit(child);
        }
        return;
      }
      collected.push(entry);
    };

    for (const input of inputs) {
      visit(input);
    }
    return collected;
  }

  private async getListFiles(info: Params$Resource$Files$List): Promise<Schema$File$Modded[]> {
    const allFiles: drive_v3.Schema$File[] = [];

    const fetchPage = async (pageToken?: string): Promise<void> => {
      const params: Params$Resource$Files$List = pageToken ? { ...info, pageToken } : { ...info };
      const { data } = await withRetry(() => this.drive.files.list(params), this.retryOptions);
      if (data.files?.length) {
        allFiles.push(...data.files);
      }
      if (data.nextPageToken) {
        await fetchPage(data.nextPageToken);
      }
    };

    try {
      await fetchPage();
      return this.parseFilesMeta(allFiles);
    } catch (err) {
      throw this.genericError(err);
    }
  }

  private async replaceExistingFile(replace: boolean, name: string, folderId: string): Promise<void> {
    const searchFile = await this.findFile(name, folderId);
    if (searchFile) {
      if (!replace) {
        throw new Error(`${Config.TAG} File "${name}" already exists and will not be replaced`);
      }
      this.logger.warn(`${Config.TAG} File "${name}" already exists and will be deleted before upload`);
      await this.deleteFile(searchFile);
    }
  }

  private async getUploadFolderId(folderName: string | boolean, create: boolean, requestBody: drive_v3.Schema$File, dryRun = false): Promise<string> {
    if (folderName && typeof folderName === 'string') {
      const folderId = await this.findFolderId(folderName, create && !dryRun);
      requestBody.parents = [folderId];
      return folderId;
    }
    if (this.sharedDriveId) {
      requestBody.parents = [this.sharedDriveId];
    }
    return '';
  }

  private async deleteOlder(amount: number, unit: ManipulateType, folderId: string, options: CleanOlderOptions = {}): Promise<Schema$File$Modded[]> {
    const dryRun = options.dryRun ?? this.defaultDryRun;
    const keepLast = Math.max(0, options.keepLast ?? 0);
    const concurrency = options.concurrency ?? this.defaultConcurrency;
    const cutoff = dayjs().subtract(amount, unit);

    const queryParts = [`mimeType != '${this.MIME_FOLDER}'`, 'trashed = false'];
    if (folderId) {
      queryParts.push(`'${escapeDriveQuery(folderId)}' in parents`);
    }
    if (keepLast === 0) {
      queryParts.push(`createdTime <= '${cutoff.toISOString()}'`);
    }

    const files = await this.listFiles(undefined, 1000, queryParts.join(' and '));

    const candidates = files
      .filter((file) => !file.isDeleted && !file.isFolder)
      .filter((file) => !folderId || Boolean(file.parents?.includes(folderId)))
      .sort((a, b) => {
        const timeA = a.createdTime ? dayjs(a.createdTime).valueOf() : 0;
        const timeB = b.createdTime ? dayjs(b.createdTime).valueOf() : 0;
        return timeB - timeA;
      });

    const eligible = keepLast > 0 ? candidates.slice(keepLast) : candidates;
    const toDelete = eligible.filter((file) => file.createdTime && dayjs(file.createdTime).isSameOrBefore(cutoff));

    if (dryRun) {
      for (const file of toDelete) {
        this.logger.info(`${Config.TAG} [dry-run] Would delete file: ${file.name ?? file.id ?? 'unknown'}`);
      }
      return toDelete;
    }

    await runWithConcurrency(toDelete, concurrency, async (file) => {
      await this.deleteFile(file);
    });

    return toDelete;
  }

  private parseFileMeta(file: drive_v3.Schema$File): Schema$File$Modded {
    return {
      ...file,
      isDeleted: this.isDeleted(file),
      isFolder: !!this.isFolder(file)
    };
  }

  private parseFilesMeta(files: drive_v3.Schema$File[]): Schema$File$Modded[] {
    return files.map((file) => this.parseFileMeta(file));
  }

  private genericError<T = Error>(err: T): T {
    this.logger.error(`${Config.TAG} The API returned an error: ${String(err)}`);
    return err;
  }

  private readonly inFlightFolders = new Map<string, Promise<string>>();

  private findFolderId(folderPath: string, create = false): Promise<string> {
    const cacheKey = `${folderPath}::${create}`;
    const inFlight = this.inFlightFolders.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.resolveFolderId(folderPath, create).finally(() => {
      this.inFlightFolders.delete(cacheKey);
    });
    this.inFlightFolders.set(cacheKey, promise);
    return promise;
  }

  private async resolveFolderId(folderPath: string, create = false): Promise<string> {
    const segments = folderPath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      throw new Error(`${Config.TAG} Invalid folder path "${folderPath}"`);
    }

    return this.resolveFolderSegments(segments, 0, this.rootParentId, create, folderPath);
  }

  private async resolveFolderSegments(segments: string[], index: number, parentId: string, create: boolean, folderPath: string): Promise<string> {
    if (index >= segments.length) {
      return parentId;
    }

    const segment = segments[index];
    const q = [
      `name = '${escapeDriveQuery(segment)}'`,
      `mimeType = '${this.MIME_FOLDER}'`,
      'trashed = false',
      `'${escapeDriveQuery(parentId)}' in parents`
    ].join(' and ');

    const matches = await this.listFiles(undefined, 100, q);
    const existing = matches.find((file) => file.isFolder && !file.isDeleted && file.name === segment && file.id);

    let nextParentId: string;
    if (existing?.id) {
      nextParentId = existing.id;
    } else if (create) {
      const created = await this.createFolder(segment, parentId);
      if (!created.id) {
        throw new Error(`${Config.TAG} Failed to create folder "${segment}"`);
      }
      nextParentId = created.id;
    } else {
      throw new Error(`${Config.TAG} Folder "${folderPath}" does not exist and will not be created`);
    }

    return this.resolveFolderSegments(segments, index + 1, nextParentId, create, folderPath);
  }

  private async findFile(fileName: string, folderId?: string): Promise<Schema$File$Modded | null> {
    const parentId = folderId || this.rootParentId;
    const q = [
      `name = '${escapeDriveQuery(fileName)}'`,
      `mimeType != '${this.MIME_FOLDER}'`,
      'trashed = false',
      `'${escapeDriveQuery(parentId)}' in parents`
    ].join(' and ');

    const matches = await this.listFiles(undefined, 100, q);
    const found = matches.find((f) => !f.isFolder && !f.isDeleted && f.name === fileName && (!folderId || Boolean(f.parents?.includes(folderId))));
    return found ?? null;
  }

  private async createFolder(folderName: string, parentId?: string): Promise<drive_v3.Schema$File> {
    const requestBody: drive_v3.Schema$File = {
      name: folderName,
      mimeType: this.MIME_FOLDER
    };
    if (parentId && parentId !== 'root') {
      requestBody.parents = [parentId];
    }
    try {
      const { data: createdFolder } = await withRetry(
        () =>
          this.drive.files.create({
            requestBody,
            fields: 'id',
            ...this.sharedDriveItemParams
          }),
        this.retryOptions
      );
      if (createdFolder?.id) {
        this.logger.warn(`${Config.TAG} Created folder "${folderName}" with id: "${createdFolder.id}"`);
      }
      return createdFolder;
    } catch (err) {
      throw this.genericError(err);
    }
  }

  private createPrivateTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-'));
    fs.chmodSync(dir, 0o700);
    return dir;
  }

  private sanitizeFilename(name: string): string {
    const base = path.basename(name);
    if (!base || base === '.' || base === '..') {
      throw new Error(`${Config.TAG} Invalid output filename: "${name}"`);
    }
    return base;
  }

  private compressFiles(
    files: string[],
    outputName: string,
    opts: { compressionLevel?: number; followSymlinks?: boolean } = {}
  ): Promise<{ zipPath: string; tempDir: string }> {
    const safeName = this.sanitizeFilename(outputName);
    const tempDir = this.createPrivateTempDir();
    const fileDest = path.join(tempDir, safeName);
    const compressionLevel = opts.compressionLevel ?? this.defaultCompressionLevel;
    const followSymlinks = opts.followSymlinks ?? false;

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(fileDest, { mode: 0o600 });
      const readStreams: ReadStream[] = [];
      let settled = false;

      const fail = (err: unknown) => {
        if (!settled) {
          settled = true;
          for (const stream of readStreams) {
            stream.destroy();
          }
          output.destroy();
          fs.rmSync(tempDir, { recursive: true, force: true });
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      const archive = new ZipArchive({
        zlib: { level: compressionLevel }
      });

      output.on('error', (err) => {
        fail(err);
      });

      output.on('close', () => {
        if (!settled) {
          settled = true;
          resolve({ zipPath: fileDest, tempDir });
        }
      });

      archive.on('warning', (err) => {
        this.logger.warn(`${Config.TAG} Warning compressing file`, err);
        if (err.code !== 'ENOENT') {
          fail(err);
        }
      });

      archive.on('error', (err) => {
        this.logger.error(`${Config.TAG} Error compressing file`, err);
        fail(err);
      });

      archive.pipe(output);

      try {
        for (const file of files) {
          const lstat = fs.lstatSync(file);
          if (lstat.isSymbolicLink() && !followSymlinks) {
            this.logger.warn(`${Config.TAG} Skipping symlink: ${file}`);
            continue;
          }
          const stat = lstat.isSymbolicLink() ? fs.statSync(file) : lstat;
          if (stat.isDirectory()) {
            archive.directory(file, path.basename(file));
          } else {
            const name = path.basename(file);
            const readStream = fs.createReadStream(file);
            readStream.on('error', (err) => {
              fail(err);
            });
            archive.append(readStream, { name });
            readStreams.push(readStream);
          }
        }
      } catch (err) {
        fail(err);
        return;
      }

      void archive
        .finalize()
        .catch((err) => {
          fail(err);
        })
        .finally(() => {
          for (const stream of readStreams) {
            stream.destroy();
          }
        });
    });
  }
}

export { Auth, Config, decryptBuffer, decryptFile, encryptBuffer, encryptFile, isRetryableError, withRetry };
export * from './types';
