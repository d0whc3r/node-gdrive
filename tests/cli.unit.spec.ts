import fs from 'node:fs';
import { Readable } from 'node:stream';
import mysqldump from 'mysqldump';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUsageGuide, getVersion, parseCliArgs } from '../cli/cliconfig';
import { Cli } from '../cli/climodule';
import type { GDrive } from '../src';
import Config from '../src/config';
import type { Logger } from '../src/types';

vi.mock('mysqldump', () => ({
  default: vi.fn()
}));

function createMockGDrive() {
  return {
    listFiles: vi.fn(),
    uploadFiles: vi.fn(),
    uploadStream: vi.fn(),
    cleanOlder: vi.fn(),
    downloadFile: vi.fn()
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe('CLI argument parsing & commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Config.reset();
  });

  describe('parseCliArgs, getUsageGuide & getVersion', () => {
    it('parses all supported flags cleanly without side effects', () => {
      const parsed = parseCliArgs([
        '-b',
        'a.txt',
        '-b',
        'b.txt',
        '-f',
        'backups/daily',
        '-z',
        'out.zip',
        '-c',
        '-r',
        '--encrypt',
        '--dry-run',
        '--keep-last',
        '5',
        '--exclude',
        '*.log',
        '--drive-id',
        'DRIVE_123',
        '--service-account',
        './sa.json',
        '--json',
        '-q'
      ]);

      expect(parsed.backup).toEqual(['a.txt', 'b.txt']);
      expect(parsed.folder).toBe('backups/daily');
      expect(parsed.zip).toBe('out.zip');
      expect(parsed.create).toBe(true);
      expect(parsed.replace).toBe(true);
      expect(parsed.encrypt).toBe(true);
      expect(parsed['dry-run']).toBe(true);
      expect(parsed['keep-last']).toBe(5);
      expect(parsed.exclude).toEqual(['*.log']);
      expect(parsed['drive-id']).toBe('DRIVE_123');
      expect(parsed['service-account']).toBe('./sa.json');
      expect(parsed.json).toBe(true);
      expect(parsed.quiet).toBe(true);
    });

    it('parses --version, --download, --output, and --stdin --name', () => {
      expect(parseCliArgs(['--version']).version).toBe(true);
      expect(parseCliArgs(['-v']).version).toBe(true);

      const dl = parseCliArgs(['--download', 'file.zip', '-o', './out.zip', '-f', 'backups']);
      expect(dl.download).toBe('file.zip');
      expect(dl.output).toBe('./out.zip');
      expect(dl.folder).toBe('backups');

      const stdinOpts = parseCliArgs(['--stdin', '--name', 'dump.sql']);
      expect(stdinOpts.stdin).toBe(true);
      expect(stdinOpts.name).toBe('dump.sql');
    });

    it('parses --db, --db-url, and --db-format flags', () => {
      const parsed = parseCliArgs(['--db', 'postgres', '--db-url', 'postgresql://localhost/app', '--db-format', 'custom']);
      expect(parsed.db).toBe('postgres');
      expect(parsed['db-url']).toBe('postgresql://localhost/app');
      expect(parsed['db-format']).toBe('custom');
    });

    it('rejects invalid --keep-last, --stdin without --name, and unknown options', () => {
      expect(() => parseCliArgs(['--keep-last', '-1'])).toThrow('Invalid --keep-last');
      expect(() => parseCliArgs(['--stdin'])).toThrow('--stdin requires --name');
      expect(() => parseCliArgs(['--unknown-flag'])).toThrow();
    });

    it('returns version string and usage guide', () => {
      expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
      const usage = getUsageGuide();
      expect(usage).toContain('node-gdrive');
      expect(usage).toContain('--download');
      expect(usage).toContain('--keep-last');
    });
  });

  describe('Cli execution methods', () => {
    it('lists files sorted by folder/parent/name and supports --json output', async () => {
      const mockGDrive = createMockGDrive();
      const logger = createMockLogger();
      const files = [
        { id: 'f2', name: 'z.txt', parents: ['dir1'], isFolder: false, isDeleted: false },
        { id: 'dir1', name: 'backups', isFolder: true, isDeleted: false },
        { id: 'f1', name: 'a.txt', parents: ['dir1'], isFolder: false, isDeleted: false },
        { id: 'f3', name: 'root.txt', isFolder: false, isDeleted: false },
        { id: 'f4', name: 'trashed.txt', isFolder: false, isDeleted: true }
      ];
      mockGDrive.listFiles.mockResolvedValue(files);

      const cli = new Cli({ list: true }, mockGDrive as unknown as GDrive, logger);
      await cli.parseOptions();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('File list: 4'));

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const jsonCli = new Cli({ list: true, json: true }, mockGDrive as unknown as GDrive, logger);
      await jsonCli.parseOptions();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"name": "backups"'));
    });

    it('runs backup with zip, exclude, dry-run, and encryption', async () => {
      vi.stubEnv('BACKUP_ENCRYPTION_KEY', 'my-secret');
      const mockGDrive = createMockGDrive();
      const logger = createMockLogger();
      mockGDrive.uploadFiles.mockResolvedValue({ 'out.zip.enc': { id: '1', name: 'out.zip.enc', isDeleted: false, isFolder: false } });

      const cli = new Cli(
        {
          backup: ['a.txt'],
          folder: 'backups',
          zip: 'out.zip',
          create: true,
          replace: true,
          'dry-run': true,
          exclude: ['*.log'],
          encrypt: true
        },
        mockGDrive as unknown as GDrive,
        logger
      );
      await cli.parseOptions();

      expect(mockGDrive.uploadFiles).toHaveBeenCalledWith(['a.txt'], 'backups', {
        compress: 'out.zip',
        replace: true,
        create: true,
        dryRun: true,
        encryptKey: 'my-secret',
        exclude: ['*.log']
      });
    });

    it('throws when --encrypt is used without BACKUP_ENCRYPTION_KEY', async () => {
      vi.stubEnv('BACKUP_ENCRYPTION_KEY', '');
      const mockGDrive = createMockGDrive();
      const cli = new Cli({ backup: ['a.txt'], encrypt: true }, mockGDrive as unknown as GDrive, createMockLogger());

      await expect(cli.parseOptions()).rejects.toThrow('BACKUP_ENCRYPTION_KEY');
    });

    it('runs delete with folder=duration, --keep-last, --dry-run, and propagates errors', async () => {
      const mockGDrive = createMockGDrive();
      mockGDrive.cleanOlder.mockResolvedValue([{ id: 'old-1', name: 'old.zip', isDeleted: false, isFolder: false }]);

      const cli = new Cli(
        { delete: ['uploads=2d', '7d'], folder: 'default-dir', 'keep-last': 3, 'dry-run': true },
        mockGDrive as unknown as GDrive,
        createMockLogger()
      );
      await cli.parseOptions();

      expect(mockGDrive.cleanOlder).toHaveBeenNthCalledWith(1, '2d', 'uploads', { dryRun: true, keepLast: 3 });
      expect(mockGDrive.cleanOlder).toHaveBeenNthCalledWith(2, '7d', 'default-dir', { dryRun: true, keepLast: 3 });

      mockGDrive.cleanOlder.mockRejectedValueOnce(new Error('Invalid timeSpace'));
      await expect(cli.delete('bad', undefined)).rejects.toThrow('Invalid timeSpace');
    });

    it('runs download (with and without encryption) and stdin upload', async () => {
      vi.stubEnv('BACKUP_ENCRYPTION_KEY', 'dl-secret');
      const mockGDrive = createMockGDrive();
      mockGDrive.downloadFile.mockResolvedValue('backup.zip');
      mockGDrive.uploadStream.mockResolvedValue({ id: 's1', name: 'pipe.sql', isDeleted: false, isFolder: false });

      const dlCli = new Cli({ download: 'backup.zip.enc', folder: 'backups', encrypt: true }, mockGDrive as unknown as GDrive, createMockLogger());
      await dlCli.parseOptions();
      expect(mockGDrive.downloadFile).toHaveBeenCalledWith('backup.zip.enc', 'backup.zip', {
        decryptKey: 'dl-secret',
        folderName: 'backups'
      });

      const stdinCli = new Cli({ stdin: true, name: 'pipe.sql', folder: 'pg', create: true }, mockGDrive as unknown as GDrive, createMockLogger());
      await stdinCli.parseOptions(Readable.from(['SELECT 1;']));
      expect(mockGDrive.uploadStream).toHaveBeenCalledWith(expect.any(Readable), 'pipe.sql', 'pg', {
        replace: undefined,
        create: true,
        dryRun: undefined,
        encryptKey: undefined
      });
    });

    it('throws on missing MySQL env vars and cleans up temp dump file after MySQL backup', async () => {
      vi.stubEnv('PATH', '');
      vi.stubEnv('MYSQL_USER', '');
      vi.stubEnv('MYSQL_PASSWORD', '');
      vi.stubEnv('MYSQL_DATABASE', '');

      const mockGDrive = createMockGDrive();
      const cli = new Cli({ mysql: true }, mockGDrive as unknown as GDrive, createMockLogger());
      await expect(cli.parseOptions()).rejects.toThrow('Missing required MySQL environment variables');

      vi.stubEnv('MYSQL_USER', 'root');
      vi.stubEnv('MYSQL_PASSWORD', 'secret');
      vi.stubEnv('MYSQL_DATABASE', 'appdb');

      vi.mocked(mysqldump).mockResolvedValueOnce({
        dump: { schema: '# header\nCREATE TABLE a (id INT);', data: 'INSERT INTO a VALUES (1);', trigger: null },
        tables: []
      } as never);

      let uploadedDumpPath = '';
      mockGDrive.uploadFiles.mockImplementationOnce(async (files: string[]) => {
        uploadedDumpPath = files[0];
        expect(fs.existsSync(uploadedDumpPath)).toBe(true);
        expect(fs.readFileSync(uploadedDumpPath, 'utf8')).toContain('-- header');
        return {};
      });

      await cli.parseOptions();
      expect(uploadedDumpPath).toContain('mysqldump-');
      expect(fs.existsSync(uploadedDumpPath)).toBe(false);
    });
  });
});
