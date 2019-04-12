import * as fs from 'fs';
import * as path from 'path';
import * as moment from 'moment';
import { GDrive } from '../src';
import Config from '../src/config';
import { createCredentialsFile, createTokenFile, DEFAULT_TIMEOUT, isCI } from './helper';

let canContinue = false;

async function deleteAllFiles(gDrive: GDrive) {
  const files = await gDrive.listFiles();
  for (let i = 0; i < files.length; i++) {
    await gDrive.deleteFile(files[i]);
  }
}

// Variable set to true in CI
const DELETE_ALL_FILES: string | boolean | number = isCI || process.env.DELETE_ALL_FILES || false;

describe('Basic GDrive initialize', () => {

  beforeAll(() => {
    canContinue = true;
    createCredentialsFile();
    createTokenFile();
  });

  it('new GDrive object', () => {
    canContinue = false;
    expect(new GDrive()).toBeDefined();
    canContinue = true;
  });

  it('check for credentials', async (done) => {
    canContinue = false;
    expect(fs.existsSync(Config.CREDENTIALS_FILE)).toBeTruthy();
    expect(fs.existsSync(Config.TOKEN_FILE)).toBeTruthy();
    canContinue = true;

    if ([true, 'true', 1, '1'].includes(DELETE_ALL_FILES)) {
      console.warn('--- FORCE CLEAN ALL FILES IN ACCOUNT');
      await deleteAllFiles(new GDrive());
    }
    done();
  }, DEFAULT_TIMEOUT);

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
        console.warn('---- START AFTER EACH ----');
        await deleteAllFiles(gDrive);
        console.warn('---- END AFTER EACH ----');
        done();
      }
    });

    it('Empty trash', async (done) => {
      const result = await gDrive.emptyTrash();
      expect(result).toBeDefined();
      expect(result.status).toBeGreaterThanOrEqual(200);
      expect(result.status).toBeLessThan(300);
      done();
    }, DEFAULT_TIMEOUT);

    describe('Upload single file', () => {
      const sampleFile = './tests/sample/sample.txt';
      const fileName = path.basename(sampleFile);
      const folderName = 'test folder single';

      it('Backup 1 sample file', async (done) => {
        const result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        expect(theFile.isDeleted).toBeFalsy();
        expect(theFile.isFolder).toBeFalsy();

        const file = await gDrive.getFile(theFile.id);
        expect(file.id).toBe(theFile.id);
        expect(file.name).toBe(theFile.name);
        done();
      }, DEFAULT_TIMEOUT);

      it('GetFile of undefined file', async (done) => {
        try {
          await gDrive.getFile(undefined);
          fail('Get file of undefined must to fail');
        } catch (err) {
          expect(err).toBeDefined();
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('GetFile non existing file', async (done) => {
        try {
          const result = await gDrive.getFile('NON_EXISTING_FILE_ID');
          expect(result).not.toBeDefined();
          fail('Get file of undefined must to fail');
        } catch (err) {
          expect(err).toBeDefined();
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 1 sample file to folder with create = true', async (done) => {
        const result = await gDrive.uploadFile(sampleFile, folderName, { create: true });
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
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 1 sample file to folder with create = false', async (done) => {
        try {
          await gDrive.uploadFile(sampleFile, folderName, { create: false });
          fail('Folder is not created and file will be upload without create the folder');
        } catch (err) {
          expect(err).toBeDefined();
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace', async (done) => {
        let result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        result = await gDrive.uploadFile(sampleFile, false, { replace: true });
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        expect(theFile.name).toBe(fileName);
        expect(theFile.isDeleted).toBeFalsy();
        expect(theFile.isFolder).toBeFalsy();
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace to folder', async (done) => {
        let result = await gDrive.uploadFile(sampleFile, folderName);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        expect(result.parents).toBeDefined();
        expect(result.parents && result.parents.length).toBe(1);
        result = await gDrive.uploadFile(sampleFile, folderName, { replace: true });
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
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace = false', async (done) => {
        const result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        try {
          await gDrive.uploadFile(sampleFile, false, { replace: false });
          fail('If file could not be replaced, it must fail because file already exists');
        } catch (err) {
          expect(err).toBeDefined();
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace = false to folder', async (done) => {
        const result = await gDrive.uploadFile(sampleFile, folderName);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        expect(result.parents).toBeDefined();
        expect(result.parents && result.parents.length).toBe(1);
        try {
          await gDrive.uploadFile(sampleFile, folderName, { replace: false });
          fail('If file could not be replaced, it must fail because file already exists');
        } catch (err) {
          expect(err).toBeDefined();
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace not specified', async (done) => {
        let result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        const [theFile1, theFile2] = files;
        expect(theFile1.name).toBe(fileName);
        expect(theFile1.isDeleted).toBeFalsy();
        expect(theFile1.isFolder).toBeFalsy();

        expect(theFile2.name).toBe(fileName);
        expect(theFile2.isDeleted).toBeFalsy();
        expect(theFile2.isFolder).toBeFalsy();
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace not specified to folder', async (done) => {
        let result = await gDrive.uploadFile(sampleFile, folderName);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        expect(result.parents).toBeDefined();
        expect(result.parents && result.parents.length).toBe(1);
        result = await gDrive.uploadFile(sampleFile, folderName);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);
        expect(result.parents).toBeDefined();
        expect(result.parents && result.parents.length).toBe(1);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(3);

        const folder = files.find((f) => f.isFolder);
        expect(folder).toBeDefined();
        if (folder) {
          expect(folder.isDeleted).toBeFalsy();
          expect(folder.isFolder).toBeTruthy();
          expect(folder.name).toBe(folderName);
        }

        const ffiles = files.filter((f) => !f.isFolder);
        expect(ffiles).toBeDefined();
        expect(ffiles.length).toBe(2);
        if (ffiles) {
          ffiles.forEach((file) => {
            expect(file.isDeleted).toBeFalsy();
            expect(file.isFolder).toBeFalsy();
            expect(file.name).toBe(fileName);
            expect(file.parents).toBeDefined();
            expect(file.parents && file.parents[0]).toBe(folder && folder.id);
          });
        }
        done();
      }, DEFAULT_TIMEOUT);
    });

    describe('Upload multiple files', () => {
      const sampleFolder = './tests/sample';
      const sampleFile = path.join(sampleFolder, 'sample.txt');
      const fileName = path.basename(sampleFile);
      const sampleFile2 = path.join(sampleFolder, 'sample2.txt');
      const fileName2 = path.basename(sampleFile2);
      const folderName = 'test folder multiple';
      const momentFormat = moment().format('YYYY-MM-DD');
      const mimeZip = 'application/zip';

      it('Backup 2 files using array (no zip)', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2]);
        expect(result).toBeDefined();
        expect(result[fileName]).toBeDefined();
        expect(result[fileName].name).toBe(fileName);

        expect(result[fileName2]).toBeDefined();
        expect(result[fileName2].name).toBe(fileName2);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        const [theFile1, theFile2] = files;
        expect(theFile1.isDeleted).toBeFalsy();
        expect(theFile1.isFolder).toBeFalsy();
        expect(theFile2.isDeleted).toBeFalsy();
        expect(theFile2.isFolder).toBeFalsy();
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array (no zip) into folder', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], folderName);
        expect(result).toBeDefined();
        expect(result[fileName]).toBeDefined();
        expect(result[fileName].name).toBe(fileName);
        expect(result[fileName].parents).toBeDefined();
        expect((result[fileName].parents || []).length).toBe(1);

        expect(result[fileName2]).toBeDefined();
        expect(result[fileName2].name).toBe(fileName2);
        expect(result[fileName2].parents).toBeDefined();
        expect((result[fileName2].parents || []).length).toBe(1);

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
          const [theFile1, theFile2] = filesList;
          expect(theFile1.name).not.toBe(theFile2.name);
          expect(theFile1.isDeleted).toBeFalsy();
          expect(theFile1.isFolder).toBeFalsy();
          expect(theFile1.parents).toBeDefined();
          expect(theFile1.parents && theFile1.parents[0]).toBe(folder && folder.id);
          expect(theFile2.isDeleted).toBeFalsy();
          expect(theFile2.isFolder).toBeFalsy();
          expect(theFile2.parents).toBeDefined();
          expect(theFile2.parents && theFile2.parents[0]).toBe(folder && folder.id);
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array with zip', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], false, { compress: true });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        const [fileNameZip] = fileNames;
        expect(result[fileNameZip].name).toContain(`zipped_${momentFormat}`);
        expect(result[fileNameZip].name).toContain('.zip');
        expect(result[fileNameZip].mimeType).toBe(mimeZip);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        expect(theFile.isDeleted).toBeFalsy();
        expect(theFile.isFolder).toBeFalsy();
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array with zip into folder', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], folderName, { compress: true });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        const [fileNameZip] = fileNames;
        expect(result[fileNameZip].name).toContain(`zipped_${momentFormat}`);
        expect(result[fileNameZip].name).toContain('.zip');
        expect(result[fileNameZip].mimeType).toBe(mimeZip);
        expect(result[fileNameZip].parents).toBeDefined();
        expect((result[fileNameZip].parents || []).length).toBe(1);

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
          expect(file.name).toBe(fileNameZip);
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array with zip defining name', async (done) => {
        const fileNameZip = 'my_file.zip';
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], false, { compress: fileNameZip });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        expect(result[fileNameZip].name).toBe(fileNameZip);
        expect(result[fileNameZip].mimeType).toBe(mimeZip);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        expect(theFile.isDeleted).toBeFalsy();
        expect(theFile.isFolder).toBeFalsy();
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using glob (no zip)', async (done) => {
        await gDrive.uploadFiles(`${sampleFolder}/*`);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        const [theFile1, theFile2] = files;
        expect(theFile1.isDeleted).toBeFalsy();
        expect(theFile1.isFolder).toBeFalsy();
        expect(theFile2.isDeleted).toBeFalsy();
        expect(theFile2.isFolder).toBeFalsy();
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using glob (no zip) into folder', async (done) => {
        await gDrive.uploadFiles(`${sampleFolder}/*`, folderName);

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
          const [theFile1, theFile2] = filesList;
          expect(theFile1.name).not.toBe(theFile2.name);
          expect(theFile1.isDeleted).toBeFalsy();
          expect(theFile1.isFolder).toBeFalsy();
          expect(theFile1.parents).toBeDefined();
          expect(theFile1.parents && theFile1.parents[0]).toBe(folder && folder.id);
          expect(theFile2.isDeleted).toBeFalsy();
          expect(theFile2.isFolder).toBeFalsy();
          expect(theFile2.parents).toBeDefined();
          expect(theFile2.parents && theFile2.parents[0]).toBe(folder && folder.id);
        }
        done();
      }, DEFAULT_TIMEOUT);

    });

  });
});
