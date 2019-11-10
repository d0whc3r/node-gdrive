import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { GDrive } from '../src';
import Config from '../src/config';
import { createCredentialsFile, createTokenFile, DEFAULT_TIMEOUT, isCI } from './helper';
import { Schema$File$Modded } from '../src/types';

let canContinue = false;

async function deleteAllFiles(gDrive: GDrive) {
  const files = await gDrive.listFiles();
  for (let i = 0; i < files.length; i++) {
    await gDrive.deleteFile(files[i]);
  }
}

let momentFormat: string;
const mimeZip = 'application/zip';

// Variable set to true in CI
const DELETE_ALL_FILES: string | boolean | number = isCI || process.env.DELETE_ALL_FILES || false;

function getSecsBetween(file1: Schema$File$Modded, file2: Schema$File$Modded) {
  const now = +moment().toDate();
  const time1 = +moment(file1.createdTime || undefined).toDate();
  const time2 = +moment(file2.createdTime || undefined).toDate();
  const difSecs = Math.abs(Math.floor((time1 - time2) / 1000));
  const minTime = Math.min(time1, time2);
  return Math.floor((now - minTime + Math.floor(difSecs / 2)) / 1000);
}

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
    let gDrive: GDrive;
    let canClean = false;

    const sampleFolder = './tests/sample';
    const sampleFile = path.join(sampleFolder, 'sample.txt');
    const fileName = path.basename(sampleFile);
    const sampleFile2 = path.join(sampleFolder, 'sample2.txt');
    const fileName2 = path.basename(sampleFile2);
    let folderName = 'test folder single';

    beforeAll(async () => {
      gDrive = new GDrive();
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
      it('Backup 1 sample file', async (done) => {
        const result = await gDrive.uploadFile(sampleFile);
        expect(result).toBeDefined();
        expect(result.name).toBe(fileName);

        const files = await gDrive.listFiles(true);
        expect(files.length).toBe(1);
        const [theFile] = files;
        check1File(theFile);
        expect(theFile.fileExtension).toBe('txt');
        expect(theFile.iconLink).toBeDefined();

        const file = await gDrive.getFile(theFile.id);
        expect(file).toBeDefined();
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
          fail('Get no existing file must fail');
        } catch (err) {
          expect(err).toBeDefined();
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 1 sample file to folder with create = true', async (done) => {
        const result = await gDrive.uploadFile(sampleFile, folderName, { create: true });
        check1File(result, { folder: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);

        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const file = files.find((f) => !f.isFolder);
        check1File(file, { fileName, folder });
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
        check1File(result, { fileName });
        result = await gDrive.uploadFile(sampleFile, false, { replace: true });
        check1File(result, { fileName });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        check1File(theFile, { fileName });
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace to folder', async (done) => {
        let result = await gDrive.uploadFile(sampleFile, folderName);
        check1File(result, { fileName, folder: true });
        result = await gDrive.uploadFile(sampleFile, folderName, { replace: true });
        check1File(result, { fileName, folder: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);

        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const file = files.find((f) => !f.isFolder);
        check1File(file, { fileName, folder });
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup the same file twice with replace = false', async (done) => {
        const result = await gDrive.uploadFile(sampleFile);
        check1File(result, { fileName });
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
        check1File(result, { fileName, folder: true });
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
        check1File(result, { fileName });
        result = await gDrive.uploadFile(sampleFile);
        check1File(result, { fileName });

        const files = await gDrive.listFiles();
        check2Files(files, { fileName: [fileName, fileName] });
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
      folderName = 'test folder multiple';

      beforeEach(() => {
        momentFormat = moment().format('YYYY-MM-DD');
      });

      it('Backup 2 files using array (no zip)', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2]);
        expect(result).toBeDefined();
        check1File(result[fileName], { fileName });
        check1File(result[fileName2], { fileName: fileName2 });

        const files = await gDrive.listFiles();
        check2Files(files);
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array (no zip) into folder', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], folderName);
        expect(result).toBeDefined();
        check1File(result[fileName], { fileName, folder: true });
        check1File(result[fileName2], { fileName: fileName2, folder: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(3);
        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const filesList = files.filter((f) => !f.isFolder);
        expect(filesList).toBeDefined();
        expect(filesList.length).toBe(2);

        if (filesList) {
          const [theFile1, theFile2] = filesList;
          expect(theFile1.name).not.toBe(theFile2.name);
          check2Files(filesList, { folder, fileName: [theFile1.name, theFile2.name] });
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array with zip', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], false, { compress: true });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        const [fileNameZip] = fileNames;
        check1ZipFile(result[fileNameZip]);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        check1ZipFile(theFile);
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array with zip into folder', async (done) => {
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], folderName, { compress: true });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        const [fileNameZip] = fileNames;
        check1ZipFile(result[fileNameZip], { folder: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const file = files.find((f) => !f.isFolder);
        check1File(file, { fileName: fileNameZip });
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup 2 files using array with zip defining name', async (done) => {
        const fileNameZip = 'my_file.zip';
        const result = await gDrive.uploadFiles([sampleFile, sampleFile2], false, { compress: fileNameZip });
        expect(result).toBeDefined();
        const fileNames = Object.keys(result);
        expect(fileNames.length).toBe(1);
        check1ZipFile(result[fileNameZip], { fileName: fileNameZip });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        check1ZipFile(theFile, { fileName: fileNameZip });
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup using glob (no zip)', async (done) => {
        await gDrive.uploadFiles(`${sampleFolder}/*`);

        const files = await gDrive.listFiles();
        check2Files(files);
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup using glob (no zip) into folder', async (done) => {
        await gDrive.uploadFiles(`${sampleFolder}/*`, folderName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(3);
        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const filesList = files.filter((f) => !f.isFolder);
        expect(filesList).toBeDefined();
        expect(filesList.length).toBe(2);
        if (filesList) {
          const [theFile1, theFile2] = filesList;
          expect(theFile1.name).not.toBe(theFile2.name);
          check2Files(filesList, { folder, fileName: [theFile1.name, theFile2.name] });
        }
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup using glob with zip', async (done) => {
        await gDrive.uploadFiles(`${sampleFolder}/*`, false, { compress: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        const [theFile] = files;
        check1ZipFile(theFile);
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup using glob with zip into folder', async (done) => {
        await gDrive.uploadFiles(`${sampleFolder}/*`, folderName, { compress: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);
        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const filesList = files.filter((f) => !f.isFolder);
        expect(filesList.length).toBe(1);
        check1ZipFile(filesList[0], { folder });
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup using folder (no zip)', async (done) => {
        await gDrive.uploadFiles(sampleFolder);

        const files = await gDrive.listFiles();
        check2Files(files);
        done();
      }, DEFAULT_TIMEOUT);

      it('Backup using folder (no zip) into folder', async (done) => {
        await gDrive.uploadFiles(sampleFolder, folderName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(3);
        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const filesList = files.filter((f) => !f.isFolder);
        expect(filesList).toBeDefined();
        expect(filesList.length).toBe(2);
        if (filesList) {
          const [theFile1, theFile2] = filesList;
          expect(theFile1.name).not.toBe(theFile2.name);
          check2Files(filesList, { folder, fileName: [theFile1.name, theFile2.name] });
        }
        done();
      }, DEFAULT_TIMEOUT);

    });

    describe('Delete files', () => {
      folderName = 'folder for deletes';

      it('Delete a file', async (done) => {
        const result = await gDrive.uploadFile(sampleFile);
        check1File(result, { fileName });

        await gDrive.deleteFile(result);
        await wait(3);
        const filesRes = await gDrive.listFiles();
        expect(filesRes.length).toBe(0);
        done();
      }, DEFAULT_TIMEOUT);

      it('Delete a folder', async (done) => {
        const result = await gDrive.uploadFile(sampleFile, folderName);
        check1File(result, { folder: true });

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);

        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const file = files.find((f) => !f.isFolder);
        check1File(file, { fileName, folder });

        if (folder) {
          await gDrive.deleteFile(folder);
        }
        await wait(3);
        const filesRes = await gDrive.listFiles();
        expect(filesRes.length).toBe(0);
        done();
      }, DEFAULT_TIMEOUT);

      it('Clean older than', async (done) => {
        const result = await gDrive.uploadFile(sampleFile);
        check1File(result, { fileName });
        const up1 = await gDrive.listFiles();
        expect(up1.length).toBe(1);

        await wait(8);

        const result2 = await gDrive.uploadFile(sampleFile2);
        check1File(result2, { fileName: fileName2 });
        const up2 = await gDrive.listFiles();
        expect(up2.length).toBe(2);

        const secs = getSecsBetween(up2[0], up2[1]);
        await gDrive.cleanOlder(`${secs}s`);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(1);
        check1File(files[0], { fileName: fileName2 });
        done();
      }, DEFAULT_TIMEOUT);

      it('Clean older than in folder', async (done) => {
        const result = await gDrive.uploadFile(sampleFile, folderName);
        check1File(result, { fileName, folder: true });
        const up1 = await gDrive.listFiles();
        expect(up1.length).toBe(2);

        await wait(8);

        const result2 = await gDrive.uploadFile(sampleFile2, folderName);
        check1File(result2, { fileName: fileName2, folder: true });
        const up2 = await gDrive.listFiles();
        expect(up2.length).toBe(3);

        const secs = getSecsBetween(up2[0], up2[1]);
        await gDrive.cleanOlder(`${secs}s`, folderName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(2);

        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const file = files.find((f) => !f.isFolder);
        check1File(file, { fileName: fileName2, folder });
        done();
      }, DEFAULT_TIMEOUT);

      it('Clean older than in folder with file outside', async (done) => {
        const file1 = await gDrive.uploadFile(sampleFile, folderName);
        check1File(file1, { fileName, folder: true });
        const outside = await gDrive.uploadFile(sampleFile);
        check1File(outside, { fileName, folder: false });
        const up1 = await gDrive.listFiles();
        expect(up1.length).toBe(3);

        await wait(8);

        const file2 = await gDrive.uploadFile(sampleFile2, folderName);
        check1File(file2, { fileName: fileName2, folder: true });
        const up2 = await gDrive.listFiles();
        expect(up2.length).toBe(4);

        const secs = getSecsBetween(file1, file2);
        await gDrive.cleanOlder(`${secs}s`, folderName);

        const files = await gDrive.listFiles();
        expect(files.length).toBe(3);

        const folder = files.find((f) => f.isFolder);
        check1Folder(folder, folderName);

        const ffiles = files.filter((f) => !f.isFolder);
        check2Files(ffiles);
        done();
      }, DEFAULT_TIMEOUT);
    });
  });

});

type Check1FileOptions = {
  folder?: Schema$File$Modded | boolean;
  fileName?: string | null;
};

type Check2FileOptions = {
  folder?: Schema$File$Modded | boolean;
  fileName?: (string | null | undefined)[];
};

function check1File(file?: Schema$File$Modded, options?: Check1FileOptions) {
  expect(file).toBeDefined();
  if (file) {
    expect(file).toBeDefined();
    expect(file.isDeleted).toBeFalsy();
    expect(file.isFolder).toBeFalsy();
    if (options) {
      _checkFileName(file, options.fileName);
      _checkFileFolder(file, options.folder);
    }
  }
}

function _checkFileName(file: Schema$File$Modded, fileName?: string | null) {
  if (fileName) {
    expect(file.name).toBe(fileName);
  }
}

function _checkFileFolder(file: Schema$File$Modded, folder?: Schema$File$Modded | boolean) {
  if (folder) {
    expect(file.parents).toBeDefined();
    expect(file.parents && file.parents.length).toBe(1);
    if (typeof folder !== 'boolean') {
      expect(file.parents && file.parents[0]).toBe(folder && folder.id);
    }
  }
}

function check1Folder(folder?: Schema$File$Modded, folderName?: string) {
  expect(folder).toBeDefined();
  if (folder) {
    expect(folder.isDeleted).toBeFalsy();
    expect(folder.isFolder).toBeTruthy();
    if (folderName) {
      expect(folder.name).toBe(folderName);
    }
  }
}

function check2Files(files: Schema$File$Modded[], options?: Check2FileOptions) {
  expect(files.length).toBe(2);
  const [theFile1, theFile2] = files;
  check1File(theFile1, options && { folder: options.folder, fileName: options.fileName && options.fileName[0] });
  check1File(theFile2, options && { folder: options.folder, fileName: options.fileName && options.fileName[1] });
}

function check1ZipFile(file?: Schema$File$Modded, options?: Check1FileOptions) {
  check1File(file, options);
  if (file) {
    expect(file.mimeType).toBe(mimeZip);
    if (!options || (options && !options.fileName)) {
      expect(file.name).toContain(`zipped_${momentFormat}`);
      expect(file.name).toContain('.zip');
    }
  }
}

function wait(timeInSecs: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, timeInSecs * 1000);
  });
}
