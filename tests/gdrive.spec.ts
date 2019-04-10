import * as fs from 'fs';
import { GDrive } from '../src';
import Config from '../src/config';

describe('Basic GDrive initialize', () => {
  it('new GDrive object', () => {
    expect(new GDrive()).toBeDefined();
  });

  it('check for credentials', () => {
    expect(fs.existsSync(Config.CREDENTIALS_FILE)).toBeTruthy();
    expect(fs.existsSync(Config.TOKEN_FILE)).toBeTruthy();
  });

  describe('Gdrive tests', () => {
    const gDrive = new GDrive();
    let canClean = false;

    afterAll(async () => {
      // Delete ALL files
      if (canClean) {
        const files = await gDrive.listFiles();
        files.forEach(async (file) => {
          await gDrive.deleteFile(file);
        });
      }
    });

    beforeAll(async () => {
      const files = await gDrive.listFiles();
      if (files.length) {
        console.error('[WARNING] Account to use in tests must have 0 files');
        process.exit(-1);
      }
      expect(files.length).toBe(0);
      canClean = true;
    });

    it('check backup sample file', async () => {
      const result = await gDrive.uploadFile('./tests/sample.txt');
      expect(result).toBeDefined();
      expect(result.name).toBe('sample.txt');
      const files = await gDrive.listFiles();
      expect(files.length).toBe(1);
      expect(files[0].isDeleted).toBeFalsy();
      expect(files[0].isFolder).toBeFalsy();
    });

  });
});
