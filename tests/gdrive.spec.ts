import * as fs from 'fs';
import * as path from 'path';
import * as moment from 'moment';
import { GDrive } from '../src';
import Config from '../src/config';

let canContinue = false;

describe('Basic GDrive initialize', () => {

  beforeAll(() => {
    canContinue = true;
  });

  it('new GDrive object', () => {
    canContinue = false;
    expect(new GDrive()).toBeDefined();
    canContinue = true;
  });

  it('check for credentials', () => {
    canContinue = false;
    expect(fs.existsSync(Config.CREDENTIALS_FILE)).toBeTruthy();
    expect(fs.existsSync(Config.TOKEN_FILE)).toBeTruthy();
    canContinue = true;
  });

  describe('Gdrive tests', () => {
    const gDrive = new GDrive();
    let canClean = false;

    beforeAll(async () => {
      if (!canContinue) {
        process.exit(-1);
      }
      const files = await gDrive.listFiles();
      if (files.length) {
        console.error('[WARNING] Account to use in tests must have 0 files');
        process.exit(-1);
      }
      expect(files.length).toBe(0);
      canClean = true;
    });

    afterEach(async (done) => {
      // Delete ALL files
      if (canClean) {
        const files = await gDrive.listFiles();
        // files.forEach(async (file) => {
        //   await gDrive.deleteFile(file);
        // });
        for (let i = 0; i < files.length; i++) {
          let file = files[i];
          await gDrive.deleteFile(file);
        }
        done();
      }
    });

    describe('Upload single file', () => {
      const sampleFile = './tests/sample.txt';
      const fileName = path.basename(sampleFile);
      const folderName = 'test folder single';

      it('Backup 1 sample file', async () => {
        const result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        expect(files[0].isDeleted).toBeFalsy();
        expect(files[0].isFolder).toBeFalsy();
      });

      it('Backup 1 sample file to folder', async () => {
        const result = await gDrive.uploadFile(sampleFile, folderName);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        expect(result.parents).toBeDefined();
        expect(result.parents && result.parents.length).toBe(1);
        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);

        const folder = files.find((f) => f.isFolder);
        expect(folder).toBeDefined();
        if (folder) {
          expect(folder.isDeleted).toBeFalsy();
          expect(folder.isFolder).toBeTruthy();
          expect(folder.name).toBe(folderName);
        }

        const file = files.find((f) => !f.isFolder);
        expect(file).toBeDefined();
        if (file) {
          expect(file.isDeleted).toBeFalsy();
          expect(file.isFolder).toBeFalsy();
          expect(file.name).toBe(fileName);
          expect(file.parents).toBeDefined();
          expect(file.parents && file.parents[0]).toBe(folder && folder.id);
        }

      });

      it('Backup 1 sample file to folder with create = false', async () => {
        try {
          await gDrive.uploadFile(sampleFile, folderName, { create: false });
          fail('Folder is not created and file will be upload without create the folder');
        } catch (err) {
          expect(err).toBeDefined();
        }
      });

      it('Backup the same file twice with replace', async () => {
        let result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        result = await gDrive.uploadFile(sampleFile, false, { replace: true });
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        expect(files[0].name).toBe(fileName);
        expect(files[0].isDeleted).toBeFalsy();
        expect(files[0].isFolder).toBeFalsy();
      });

      it('Backup the same file twice with replace = false', async () => {
        const result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        try {
          await gDrive.uploadFile(sampleFile, false, { replace: false });
          fail('If file could not be replaced, it must file because file already exists');
        } catch (err) {
          expect(err).toBeDefined();
        }
      });

      it('Backup the same file twice with replace not specified', async () => {
        let result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        expect(files[0].name).toBe(fileName);
        expect(files[0].isDeleted).toBeFalsy();
        expect(files[0].isFolder).toBeFalsy();
        expect(files[1].name).toBe(fileName);
        expect(files[1].isDeleted).toBeFalsy();
        expect(files[1].isFolder).toBeFalsy();
      });

    });

    describe('Upload multiple files', () => {
      const sampleFile = './tests/sample.txt';
      const fileName = path.basename(sampleFile);
      const sampleFile2 = './tests/sample2.txt';
      const fileName2 = path.basename(sampleFile2);
      const folderName = 'test folder multiple';
      const momentFormat = moment().format('YYYY-MM-DD');
      const mimeZip = 'application/zip';

      it('Backup 2 files using array (no zip)', async () => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2]);
        expect(result).toBeDefined();
        expect(result[fileName]).toBeDefined();
        expect(result[fileName].name).toBe(fileName);

        expect(result[fileName2]).toBeDefined();
        expect(result[fileName2].name).toBe(fileName2);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        expect(files[0].isDeleted).toBeFalsy();
        expect(files[0].isFolder).toBeFalsy();
        expect(files[1].isDeleted).toBeFalsy();
        expect(files[1].isFolder).toBeFalsy();
      });

      it('Backup 2 files using array (no zip) into folder', async () => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], folderName);
        expect(result).toBeDefined();
        expect(result[fileName]).toBeDefined();
        expect(result[fileName].name).toBe(fileName);
        expect(result[fileName].parents).toBeDefined();
        // @ts-ignore
        expect(result[fileName].parents.length).toBe(1);

        expect(result[fileName2]).toBeDefined();
        expect(result[fileName2].name).toBe(fileName2);
        expect(result[fileName2].parents).toBeDefined();
        // @ts-ignore
        expect(result[fileName2].parents.length).toBe(1);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(3);
        const folder = files.find((f) => f.isFolder);
        expect(folder).toBeDefined();
        if (folder) {
          expect(folder.isDeleted).toBeFalsy();
          expect(folder.isFolder).toBeTruthy();
          expect(folder.name).toBe(folderName);
        }

        const filesList = files.filter((f) => !f.isFolder);
        expect(filesList).toBeDefined();
        expect(filesList.length).toBe(2);
        if (filesList) {
          expect(filesList[0].name).not.toBe(filesList[1].name);
          expect(filesList[0].isDeleted).toBeFalsy();
          expect(filesList[0].isFolder).toBeFalsy();
          expect(filesList[0].parents).toBeDefined();
          expect(filesList[0].parents && filesList[0].parents[0]).toBe(folder && folder.id);
          expect(filesList[1].isDeleted).toBeFalsy();
          expect(filesList[1].isFolder).toBeFalsy();
          expect(filesList[1].parents).toBeDefined();
          expect(filesList[1].parents && filesList[1].parents[0]).toBe(folder && folder.id);
        }
      });

      it('Backup 2 files using array with zip', async () => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], false, { compress: true });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        expect(result[fileNames[0]].name).toContain(`zipped_${momentFormat}`);
        expect(result[fileNames[0]].name).toContain('.zip');
        expect(result[fileNames[0]].mimeType).toBe(mimeZip);
        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        expect(files[0].isDeleted).toBeFalsy();
        expect(files[0].isFolder).toBeFalsy();
      });
    });

  });
});
