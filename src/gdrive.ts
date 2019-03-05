import Auth from '@/auth';
import { drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as readline from 'readline';
import * as mime from 'mime-types';
import * as path from 'path';
import Config from '@/config';
import * as archiver from 'archiver';
import FileUtils from '@/file.utils';
import * as moment from 'moment';
import { DurationInputArg1 } from 'moment';
import Schema$File = drive_v3.Schema$File;
import Params$Resource$Files$Get = drive_v3.Params$Resource$Files$Get;
import Params$Resource$Files$List = drive_v3.Params$Resource$Files$List;
import Params$Resource$Files$Create = drive_v3.Params$Resource$Files$Create;

export type FieldsType = 'appProperties'
    | 'capabilities'
    | 'contentHints'
    | 'createdTime'
    | 'description'
    | 'explicitlyTrashed'
    | 'fileExtension'
    | 'folderColorRgb'
    | 'fullFileExtension'
    | 'hasAugmentedPermissions'
    | 'hasThumbnail'
    | 'headRevisionId'
    | 'iconLink'
    | 'id'
    | 'imageMediaMetadata'
    | 'isAppAuthorized'
    | 'kind'
    | 'lastModifyingUser'
    | 'md5Checksum'
    | 'mimeType'
    | 'modifiedByMe'
    | 'modifiedByMeTime'
    | 'modifiedTime'
    | 'name'
    | 'originalFilename'
    | 'ownedByMe'
    | 'owners'
    | 'parents'
    | 'properties'
    | 'quotaBytesUsed'
    | 'shared'
    | 'sharedWithMeTime'
    | 'sharingUser'
    | 'size'
    | 'spaces'
    | 'starred'
    | 'teamDriveId'
    | 'thumbnailLink'
    | 'thumbnailVersion'
    | 'trashed'
    | 'trashedTime'
    | 'trashingUser'
    | 'version'
    | 'videoMediaMetadata'
    | 'viewedByMe'
    | 'viewedByMeTime'
    | 'viewersCanCopyContent'
    | 'webContentLink'
    | 'webViewLink'
    | 'writersCanShare';

const allFileTypes: FieldsType[] = [
  'appProperties',
  'capabilities',
  'contentHints',
  'createdTime',
  'description',
  'explicitlyTrashed',
  'fileExtension',
  'folderColorRgb',
  'fullFileExtension',
  'hasAugmentedPermissions',
  'hasThumbnail',
  'headRevisionId',
  'iconLink',
  'id',
  'imageMediaMetadata',
  'isAppAuthorized',
  'lastModifyingUser',
  'md5Checksum',
  'mimeType',
  'modifiedByMe',
  'modifiedByMeTime',
  'modifiedTime',
  'name',
  'originalFilename',
  'ownedByMe',
  'owners',
  'parents',
  'properties',
  'quotaBytesUsed',
  'shared',
  'sharedWithMeTime',
  'sharingUser',
  'size',
  'spaces',
  'starred',
  'teamDriveId',
  'thumbnailLink',
  'thumbnailVersion',
  'trashed',
  'trashedTime',
  'trashingUser',
  'version',
  'videoMediaMetadata',
  'viewedByMe',
  'viewedByMeTime',
  'viewersCanCopyContent',
  'webContentLink',
  'webViewLink',
  'writersCanShare',
];

export interface Schema$File$Modded extends Schema$File {
  isDeleted: boolean;
  isFolder: boolean;
}

export default class GDrive {
  public readonly DEFAULT_FIELDS: FieldsType[] = [
    'createdTime',
    'id',
    'md5Checksum',
    'mimeType',
    'name',
    'parents',
    'trashed',
  ];
  private gdriveAuth: Auth;
  private readonly initiated: Promise<boolean | Error>;
  private readonly MIME_FOLDER = 'application/vnd.google-apps.folder';

  constructor() {
    this.gdriveAuth = new Auth();
    this.initiated = this.gdriveAuth.initiate();
  }

  private get auth(): OAuth2Client {
    return this.gdriveAuth.oAuth2Client(true);
  }

  private get drive() {
    return google.drive({ version: 'v3', auth: this.auth });
  }

  public isFolder(file: Schema$File) {
    if (file.hasOwnProperty('mimeType')) {
      return file.mimeType === this.MIME_FOLDER;
    }
    return undefined;
  }

  public isDeleted(file: Schema$File): boolean {
    if (file.hasOwnProperty('trashed')) {
      return file.trashed;
    }
    return undefined;
  }

  async listFiles(fields?: boolean | FieldsType[], pageSize = 50): Promise<Schema$File$Modded[]> {
    await this.initiated;
    if (!fields) {
      fields = this.DEFAULT_FIELDS;
    } else if (fields === true) {
      fields = allFileTypes;
    }
    const info: Params$Resource$Files$List = {
      pageSize,
      fields: `kind, nextPageToken, incompleteSearch, files(${fields.join(', ')})`,
      prettyPrint: true,
      includeTeamDriveItems: false,
    };
    return this.drive.files.list(info)
        .then(({ data }) => this.parseFilesMeta(data.files))
        .catch(this.genericError);
  }

  async getFile(fileId: string): Promise<Schema$File> {
    await this.initiated;
    const info: Params$Resource$Files$Get = { fileId };
    return this.drive.files.get(info)
        .then(({ data }) => data)
        .catch(this.genericError);
  }

  async emptyTrash() {
    await this.initiated;
    return this.drive.files.emptyTrash();
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.initiated;
    return this.drive.files.delete({ fileId })
        .then(({ data }) => data)
        .catch(this.genericError);
  }

  async uploadFile(
      file: string,
      folderName?: string,
      options?: { create?: boolean; replace?: boolean },
  ): Promise<Schema$File> {
    await this.initiated;
    let { create, replace } = options;
    if (create === undefined) {
      create = true;
    }
    const name = path.basename(file);
    const mimeType = mime.contentType(file);
    const requestBody: Schema$File = {
      name,
      mimeType,
    };
    let folderId: string;
    if (folderName) {
      folderId = await this.findFolderId(folderName, create);
      if (folderId) {
        requestBody.parents = [folderId];
      } else {
        return Promise.reject(
            new Error(`${Config.TAG} Folder "${folderName}" does not exists and will not be created`));
      }
    }
    if (replace !== undefined) {
      const searchFileId = await this.findFileId(name, folderId);
      if (searchFileId) {
        if (!replace) {
          return Promise.reject(new Error(`${Config.TAG} File "${name}" already exists and will not be replaced`));
        } else {
          console.warn(`${Config.TAG} File "${name}" already exists and will be deleted before upload`);
          await this.deleteFile(searchFileId);
        }
      }
    }
    const createOptions: Params$Resource$Files$Create = {
      requestBody,
      media: {
        body: fs.createReadStream(file),
      },
      fields: `kind, ${this.DEFAULT_FIELDS.join(', ')}`,
    };
    const fileSize = fs.statSync(file).size;
    const onUploadProgress = (evt) => {
      const progress = (evt.bytesRead / fileSize) * 100;
      readline.clearLine(undefined, undefined);
      readline.cursorTo(undefined, 0);
      process.stdout.write(`${name}: ${Math.round(progress)}% complete`);
      if (progress === 100) {
        process.stdout.write('\n');
      }
    };
    return this.drive.files.create(createOptions, { onUploadProgress })
        .then(({ data }) => data)
        .catch(this.genericError);
  }

  async uploadFiles(
      files: string[],
      folderName?: string,
      options?: { compress?: string | boolean; replace?: boolean; create?: boolean },
  ): Promise<{ [filename: string]: Schema$File$Modded }> {
    await this.initiated;
    let { compress, replace, create } = options;
    if (compress === undefined) {
      compress = true;
    }
    let uploadFiles = files;
    if (compress) {
      let zipName = compress;
      if (typeof zipName !== 'string') {
        zipName = `zipped_${moment().format('YYYY-MM-DD.HHmmss')}.zip`;
      }
      const result = await this.compressFiles(files, zipName);
      uploadFiles = [result];
    }
    const result: { [filename: string]: Schema$File$Modded } = {};
    for (let file of uploadFiles) {
      let filename = path.basename(file);
      const upFile = await this.uploadFile(file, folderName, { replace, create });
      result[filename] = this.parseFileMeta(upFile);
    }

    return result;
  }

  async cleanOlder(timeSpace: DurationInputArg1, folderName?: string): Promise<void> {
    await this.initiated;
    let folderId: string;
    try {
      folderId = await this.findFolderId(folderName, false);
    } catch (_) {
    }
    const files = await this.listFiles();
    if (files && files.length) {
      const filtered = files
          .filter((file) => file.isFolder)
          // .filter((file) => !file.trashed)
          .filter((file) => !folderId || file.parents.some((folder) => folder === folderId))
          .filter((file) => moment(file.createdTime).isSameOrBefore(moment().subtract(timeSpace), 'days'));
      if (filtered && filtered.length) {
        for (let file of filtered) {
          await this.deleteFile(file.id);
        }
        await this.cleanOlder(timeSpace, folderName);
      }
    }
  }

  private parseFileMeta(file: Schema$File): Schema$File$Modded {
    return {
      ...file,
      isDeleted: this.isDeleted(file),
      isFolder: this.isFolder(file),
    };
  }

  private parseFilesMeta(files: Schema$File[]): Schema$File$Modded[] {
    return [...files].map((file) => this.parseFileMeta(file));
  }

  private genericError<T>(err: T): T {
    console.error(`${Config.TAG} The API returned an error: ${err}`);
    return err;
  }

  private async findFolderId(folderName: string, create = false): Promise<string> {
    const folder = (await this.listFiles())
        .filter((file) => file.isFolder)
        .filter((file) => !file.isDeleted)
        .filter((file) => file.name === folderName)
        .map((file) => file.id);
    if (folder && folder.length) {
      return folder[0];
    } else if (create) {
      const createdFolder = await this.createFolder(folderName);
      return createdFolder.id;
    }
    return null;
  }

  private async findFileId(fileName: string, folderId?: string): Promise<string> {
    const file = (await this.listFiles())
        .filter((file) => !file.isFolder)
        .filter((file) => !file.isDeleted)
        .filter((file) => file.name === fileName)
        .filter((file) => !folderId || file.parents.some((folder) => folder === folderId))
        .map((file) => file.id);
    if (file && file.length) {
      return file[0];
    }
    return null;
  }

  private async createFolder(folderName: string): Promise<Schema$File> {
    const createdFolder = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: this.MIME_FOLDER,
      },
      fields: 'id',
    })
        .then(({ data }) => data)
        .catch(this.genericError);
    console.warn(`${Config.TAG} Created folder "${folderName}" with id: "${createdFolder.id}"`);
    return createdFolder;
  }

  private compressFiles(files: string[], outputName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileDest = path.resolve('files', outputName);
      FileUtils.mkdirp(path.dirname(fileDest));
      const output = fs.createWriteStream(fileDest);
      const archive = archiver('zip', {
        zlib: { level: 9 },
      });
      output.on('close', function() {
        resolve(fileDest);
      });

      output.on('end', function() {
        resolve(fileDest);
      });

      archive.on('warning', function(err) {
        console.warn(`${Config.TAG} Warning compressing file`, err);
        if (err.code !== 'ENOENT') {
          reject(err);
        }
      });

      archive.on('error', function(err) {
        console.error(`${Config.TAG} Error compressing file`);
        reject(err);
      });
      archive.pipe(output);

      files.forEach((file) => {
        const name = path.basename(file);
        archive.append(fs.createReadStream(file), { name });
      });

      archive.finalize();
    });
  }
}
