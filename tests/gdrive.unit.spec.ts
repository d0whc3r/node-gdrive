import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { drive_v3 } from '@googleapis/drive';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptBuffer, escapeDriveQuery, GDrive, parseTimeSpace, withRetry } from '../src';
import Config from '../src/config';
import type { FieldsType, Logger, UploadProgressEvent } from '../src/types';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

function createMockDrive() {
  return {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      emptyTrash: vi.fn()
    }
  };
}

describe('GDrive unit tests', () => {
  let tmpDir: string;
  let sampleFile: string;
  let sampleFile2: string;
  let emptyFile: string;
  let subDir: string;
  let subFile: string;
  let logFile: string;
  let symlinkFile: string;
  let mockDrive: ReturnType<typeof createMockDrive>;
  let logger: Logger;
  let gdrive: GDrive;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-unit-'));
    sampleFile = path.join(tmpDir, 'sample.txt');
    sampleFile2 = path.join(tmpDir, 'sample2.txt');
    emptyFile = path.join(tmpDir, 'empty.txt');
    subDir = path.join(tmpDir, 'nested');
    subFile = path.join(subDir, 'inner.txt');
    logFile = path.join(tmpDir, 'debug.log');
    symlinkFile = path.join(tmpDir, 'link.txt');

    fs.writeFileSync(sampleFile, 'hello world', 'utf8');
    fs.writeFileSync(sampleFile2, 'second file content', 'utf8');
    fs.writeFileSync(emptyFile, '', 'utf8');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(subFile, 'inner content', 'utf8');
    fs.writeFileSync(logFile, 'ignored log', 'utf8');
    fs.symlinkSync(sampleFile, symlinkFile);
  });

  beforeEach(() => {
    mockDrive = createMockDrive();
    logger = createMockLogger();
    gdrive = new GDrive({
      drive: mockDrive as unknown as drive_v3.Drive,
      logger,
      retry: { maxRetries: 2, baseDelayMs: 1, jitter: false, sleep: async () => {} }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Config.reset();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('helpers & metadata predicates', () => {
    it('detects folders and deleted files accurately', () => {
      expect(gdrive.isFolder({ mimeType: 'application/vnd.google-apps.folder' })).toBe(true);
      expect(gdrive.isFolder({ mimeType: 'text/plain' })).toBe(false);
      expect(gdrive.isFolder({})).toBeUndefined();

      expect(gdrive.isDeleted({ trashed: true })).toBe(true);
      expect(gdrive.isDeleted({ trashed: false })).toBe(false);
      expect(gdrive.isDeleted({})).toBe(false);
    });

    it('escapes Drive query strings safely', () => {
      expect(escapeDriveQuery("O'Reilly\\backups")).toBe("O\\'Reilly\\\\backups");
    });

    it('validates timeSpace strictly with allowlist units', () => {
      expect(parseTimeSpace('30s')).toEqual({ amount: 30, unit: 'second' });
      expect(parseTimeSpace('15minutes')).toEqual({ amount: 15, unit: 'minute' });
      expect(parseTimeSpace('2h')).toEqual({ amount: 2, unit: 'hour' });
      expect(parseTimeSpace('7d')).toEqual({ amount: 7, unit: 'day' });
      expect(parseTimeSpace('2weeks')).toEqual({ amount: 2, unit: 'week' });
      expect(parseTimeSpace('1M')).toEqual({ amount: 1, unit: 'month' });
      expect(parseTimeSpace('1year')).toEqual({ amount: 1, unit: 'year' });

      expect(() => parseTimeSpace('10days_extra')).toThrow('Invalid timeSpace');
      expect(() => parseTimeSpace('0d')).toThrow('positive integer');
      expect(() => parseTimeSpace('-5d')).toThrow('Invalid timeSpace');
      expect(() => parseTimeSpace('abc')).toThrow('Invalid timeSpace');
      expect(() => parseTimeSpace('5x')).toThrow('Invalid timeSpace');
    });

    it('does not cause UnhandledPromiseRejection when credentials are missing on construction', async () => {
      const instance = new GDrive({
        credentialsFile: path.join(tmpDir, 'non-existent-creds.json'),
        logger
      });
      await expect(instance.listFiles()).rejects.toThrow('Credentials file not found');
    });
  });

  describe('listFiles, getFile, emptyTrash, deleteFile', () => {
    it('paginates iteratively across multiple pages and validates fields', async () => {
      mockDrive.files.list
        .mockResolvedValueOnce({
          data: {
            files: [{ id: '1', name: 'a.txt', mimeType: 'text/plain', trashed: false }],
            nextPageToken: 'page-2'
          }
        })
        .mockResolvedValueOnce({
          data: {
            files: [{ id: '2', name: 'folder', mimeType: 'application/vnd.google-apps.folder', trashed: false }]
          }
        });

      const files = await gdrive.listFiles();
      expect(files).toHaveLength(2);
      expect(files[0].isFolder).toBe(false);
      expect(files[1].isFolder).toBe(true);
      expect(mockDrive.files.list).toHaveBeenCalledTimes(2);
      expect(mockDrive.files.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ pageSize: 1000, prettyPrint: false }));
      expect(mockDrive.files.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'page-2' }));

      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      await gdrive.listFiles(true);
      expect(mockDrive.files.list).toHaveBeenLastCalledWith(expect.objectContaining({ fields: expect.stringContaining('fileExtension') }));

      await expect(gdrive.listFiles(['invalidField' as FieldsType])).rejects.toThrow('Invalid Drive file field');
    });

    it('passes Shared Drive params when sharedDriveId is configured', async () => {
      const sharedGDrive = new GDrive({
        drive: mockDrive as unknown as drive_v3.Drive,
        sharedDriveId: '0AA_SHARED_ID',
        logger
      });
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });

      await sharedGDrive.listFiles();
      expect(mockDrive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          corpora: 'drive',
          driveId: '0AA_SHARED_ID'
        })
      );
    });

    it('gets a file by id and rejects when id is missing', async () => {
      mockDrive.files.get.mockResolvedValueOnce({ data: { id: 'f1', name: 'doc.txt' } });
      const data = await gdrive.getFile('f1');
      expect(data).toEqual({ id: 'f1', name: 'doc.txt' });

      await expect(gdrive.getFile(undefined)).rejects.toThrow('File id not found');
    });

    it('empties trash and deletes files safely', async () => {
      mockDrive.files.emptyTrash.mockResolvedValueOnce({ status: 204, data: '' });
      const trashRes = await gdrive.emptyTrash();
      expect(trashRes.status).toBe(204);

      mockDrive.files.delete.mockResolvedValueOnce({ data: '' });
      await gdrive.deleteFile({ id: 'f1', name: 'old.txt', isDeleted: false, isFolder: false });
      expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'f1' });

      expect(await gdrive.deleteFile({ isDeleted: false, isFolder: false })).toBeUndefined();
    });
  });

  describe('downloadFile', () => {
    it('downloads a file by ID and decrypts when decryptKey is provided', async () => {
      const encryptedPayload = encryptBuffer(Buffer.from('restored content', 'utf8'), 'secret-pass');
      mockDrive.files.get
        .mockResolvedValueOnce({ data: { id: 'enc-1', name: 'backup.txt.enc' } })
        .mockResolvedValueOnce({ data: Readable.from([encryptedPayload]) });

      const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-dl-'));
      try {
        const destPath = path.join(downloadDir, 'restored.txt');
        const saved = await gdrive.downloadFile('enc-1', destPath, { decryptKey: 'secret-pass' });
        expect(saved).toBe(destPath);
        expect(fs.readFileSync(destPath, 'utf8')).toBe('restored content');
      } finally {
        fs.rmSync(downloadDir, { recursive: true, force: true });
      }
    });

    it('downloads a file by name inside a nested folder', async () => {
      mockDrive.files.list
        .mockResolvedValueOnce({
          data: { files: [{ id: 'dir-1', name: 'backups', mimeType: 'application/vnd.google-apps.folder', trashed: false }] }
        })
        .mockResolvedValueOnce({
          data: { files: [{ id: 'file-1', name: 'dump.sql', mimeType: 'text/plain', parents: ['dir-1'], trashed: false }] }
        });
      mockDrive.files.get.mockResolvedValueOnce({ data: Readable.from(['SELECT 1;']) });

      const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-dl-'));
      try {
        const destPath = path.join(downloadDir, 'dump-restored.sql');
        await gdrive.downloadFile('dump.sql', destPath, { folderName: 'backups' });
        expect(fs.readFileSync(destPath, 'utf8')).toBe('SELECT 1;');
      } finally {
        fs.rmSync(downloadDir, { recursive: true, force: true });
      }
    });

    it('falls back to findFile when direct get by id fails, and throws if not found', async () => {
      mockDrive.files.get.mockRejectedValueOnce(new Error('404'));
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });

      await expect(gdrive.downloadFile('missing.txt', path.join(tmpDir, 'nope.txt'))).rejects.toThrow('not found');
    });
  });

  describe('uploadFile & uploadStream', () => {
    it('uploads to root, checks root parent in findFile, reports 0-byte progress as 100%, and invokes onProgress', async () => {
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      mockDrive.files.create.mockImplementationOnce(async (_params, opts: { onUploadProgress?: (e: { bytesRead: number }) => void }) => {
        opts?.onUploadProgress?.({ bytesRead: 0 });
        return { data: { id: 'empty-1', name: 'empty.txt', mimeType: 'text/plain', trashed: false } };
      });

      const progressEvents: UploadProgressEvent[] = [];
      const uploaded = await gdrive.uploadFile(emptyFile, false, {
        onProgress: (e) => progressEvents.push(e)
      });

      expect(uploaded.id).toBe('empty-1');
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0].percentage).toBe(100);
      expect(mockDrive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringContaining("'root' in parents")
        })
      );
    });

    it('creates nested folder paths segment by segment', async () => {
      // 'backups' exists, 'prod' does not -> creates 'prod', then checks file existence
      mockDrive.files.list
        .mockResolvedValueOnce({
          data: { files: [{ id: 'f-backups', name: 'backups', mimeType: 'application/vnd.google-apps.folder', trashed: false }] }
        })
        .mockResolvedValueOnce({ data: { files: [] } })
        .mockResolvedValueOnce({ data: { files: [] } });

      mockDrive.files.create.mockResolvedValueOnce({ data: { id: 'f-prod' } }).mockResolvedValueOnce({
        data: { id: 'up-1', name: 'sample.txt', parents: ['f-prod'], mimeType: 'text/plain', trashed: false }
      });

      const res = await gdrive.uploadFile(sampleFile, 'backups/prod', { create: true });
      expect(res.parents).toEqual(['f-prod']);
      expect(mockDrive.files.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          requestBody: expect.objectContaining({ name: 'prod', parents: ['f-backups'] })
        })
      );
    });

    it('rejects on missing folder when create=false, rejects on existing file when replace=false, and replaces when replace=true', async () => {
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      await expect(gdrive.uploadFile(sampleFile, 'missing', { create: false })).rejects.toThrow('does not exist');

      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [{ id: 'existing-1', name: 'sample.txt', mimeType: 'text/plain', trashed: false }] }
      });
      await expect(gdrive.uploadFile(sampleFile, false, { replace: false })).rejects.toThrow('already exists');

      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [{ id: 'existing-1', name: 'sample.txt', mimeType: 'text/plain', trashed: false }] }
      });
      mockDrive.files.delete.mockResolvedValueOnce({ data: '' });
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: 'new-1', name: 'sample.txt', mimeType: 'text/plain', trashed: false }
      });

      const replaced = await gdrive.uploadFile(sampleFile, false, { replace: true });
      expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'existing-1' });
      expect(replaced.id).toBe('new-1');
    });

    it('supports dryRun and encryptKey (appends .enc and cleans up temp encrypted file)', async () => {
      const dryRes = await gdrive.uploadFile(sampleFile, false, { dryRun: true });
      expect(dryRes.name).toBe('sample.txt');
      expect(mockDrive.files.create).not.toHaveBeenCalled();

      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      let uploadedPath = '';
      mockDrive.files.create.mockImplementationOnce(async (params: { media?: { body?: fs.ReadStream } }) => {
        uploadedPath = String(params.media?.body?.path ?? '');
        return { data: { id: 'enc-up', name: 'sample.txt.enc', mimeType: 'application/octet-stream', trashed: false } };
      });

      const encRes = await gdrive.uploadFile(sampleFile, false, { encryptKey: 'my-secret' });
      expect(encRes.name).toBe('sample.txt.enc');
      expect(uploadedPath).toContain('node-gdrive-');
      expect(fs.existsSync(uploadedPath)).toBe(false);
    });

    it('uploads from a readable stream and cleans up temp file', async () => {
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: 'stdin-1', name: 'pipe.sql', mimeType: 'application/sql', trashed: false }
      });

      const res = await gdrive.uploadStream(Readable.from(['CREATE TABLE t (id INT);']), 'pipe.sql');
      expect(res.name).toBe('pipe.sql');
    });
  });

  describe('uploadFiles', () => {
    it('merges recursive directory & glob results, respects exclude, and skips symlinks by default', async () => {
      mockDrive.files.list.mockResolvedValue({ data: { files: [] } });
      mockDrive.files.create.mockImplementation(async (params: { requestBody?: { name?: string } }) => ({
        data: { id: `id-${params.requestBody?.name}`, name: params.requestBody?.name, mimeType: 'text/plain', trashed: false }
      }));

      const res = await gdrive.uploadFiles([tmpDir], false, { exclude: ['*.log'] });
      expect(Object.keys(res).sort()).toEqual(['empty.txt', 'inner.txt', 'sample.txt', 'sample2.txt']);
      expect(res['debug.log']).toBeUndefined();
      expect(res['link.txt']).toBeUndefined();
    });

    it('compresses files into a private temp zip, cleans up after upload, and rejects path traversal names', async () => {
      mockDrive.files.list.mockResolvedValue({ data: { files: [] } });
      let capturedZipPath = '';
      mockDrive.files.create.mockImplementationOnce(async (params: { media?: { body?: fs.ReadStream }; requestBody?: { name?: string } }) => {
        capturedZipPath = String(params.media?.body?.path ?? '');
        return { data: { id: 'zip-1', name: params.requestBody?.name, mimeType: 'application/zip', trashed: false } };
      });

      const res = await gdrive.uploadFiles([sampleFile, sampleFile2], false, { compress: '../../evil.zip' });
      expect(res['evil.zip']).toBeDefined();
      expect(path.basename(capturedZipPath)).toBe('evil.zip');
      expect(fs.existsSync(capturedZipPath)).toBe(false);
      expect(fs.existsSync(path.dirname(capturedZipPath))).toBe(false);

      await expect(gdrive.uploadFiles([sampleFile], false, { compress: '..' })).rejects.toThrow('Invalid output filename');
    });

    it('cleans up temp zip even when upload fails', async () => {
      mockDrive.files.list.mockResolvedValue({ data: { files: [] } });
      let capturedZipPath = '';
      mockDrive.files.create.mockImplementationOnce(async (params: { media?: { body?: fs.ReadStream } }) => {
        capturedZipPath = String(params.media?.body?.path ?? '');
        throw new Error('upload boom');
      });

      await expect(gdrive.uploadFiles([sampleFile], false, { compress: 'fail.zip' })).rejects.toThrow('upload boom');
      expect(capturedZipPath).toContain('fail.zip');
      expect(fs.existsSync(capturedZipPath)).toBe(false);
    });
  });

  describe('cleanOlder', () => {
    it('deletes only non-folder, non-trashed files older than cutoff and respects keepLast and dryRun', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));

      const files = [
        { id: 'f-newest', name: 'newest.zip', mimeType: 'application/zip', createdTime: '2026-06-01T00:00:00.000Z', trashed: false },
        { id: 'f-mid', name: 'mid.zip', mimeType: 'application/zip', createdTime: '2026-05-20T00:00:00.000Z', trashed: false },
        { id: 'f-oldest', name: 'oldest.zip', mimeType: 'application/zip', createdTime: '2026-05-01T00:00:00.000Z', trashed: false },
        { id: 'd-old', name: 'old-folder', mimeType: 'application/vnd.google-apps.folder', createdTime: '2020-01-01T00:00:00.000Z', trashed: false },
        { id: 'f-trash', name: 'trashed.zip', mimeType: 'application/zip', createdTime: '2020-01-01T00:00:00.000Z', trashed: true }
      ];

      // With keepLast: 2, even though all 3 files are older than 7d, only f-oldest should be deleted!
      mockDrive.files.list.mockResolvedValueOnce({ data: { files } });
      const dryDeleted = await gdrive.cleanOlder('7d', undefined, { keepLast: 2, dryRun: true });
      expect(dryDeleted.map((f) => f.id)).toEqual(['f-oldest']);
      expect(mockDrive.files.delete).not.toHaveBeenCalled();

      mockDrive.files.list.mockResolvedValueOnce({ data: { files } });
      mockDrive.files.delete.mockResolvedValue({ data: '' });
      const actualDeleted = await gdrive.cleanOlder('7d', undefined, { keepLast: 1 });
      expect(actualDeleted.map((f) => f.id)).toEqual(['f-mid', 'f-oldest']);
      expect(mockDrive.files.delete).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid timeSpace before calling Drive API', async () => {
      await expect(gdrive.cleanOlder('invalid')).rejects.toThrow('Invalid timeSpace');
      expect(mockDrive.files.list).not.toHaveBeenCalled();
    });
  });

  describe('withRetry exponential backoff', () => {
    it('retries on 429 and 503 errors and succeeds, but does not retry on 400', async () => {
      const delays: number[] = [];
      let calls = 0;

      const result = await withRetry(
        async () => {
          calls += 1;
          if (calls === 1) {
            throw Object.assign(new Error('Rate limit'), { status: 429 });
          }
          if (calls === 2) {
            throw Object.assign(new Error('Backend error'), { response: { status: 503 } });
          }
          return 'ok';
        },
        {
          maxRetries: 3,
          baseDelayMs: 100,
          jitter: false,
          sleep: async (ms) => {
            delays.push(ms);
          }
        }
      );

      expect(result).toBe('ok');
      expect(calls).toBe(3);
      expect(delays).toEqual([100, 200]);

      let badCalls = 0;
      await expect(
        withRetry(
          async () => {
            badCalls += 1;
            throw Object.assign(new Error('Bad Request'), { status: 400 });
          },
          { maxRetries: 3, sleep: async () => {} }
        )
      ).rejects.toThrow('Bad Request');
      expect(badCalls).toBe(1);
    });
  });
});
