import { drive_v3, google } from 'googleapis';
import * as fs from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import Config from './config';
import * as archiver from 'archiver';
import FileUtils from './file.utils';
import * as moment from 'moment';
import * as glob from 'glob';
import Auth from './auth';
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
  parentFolder?: string;
}

export interface UploadOptionsBasic {
  create?: boolean;
  replace?: boolean;
}

export interface UploadOptions extends UploadOptionsBasic {
  compress?: string | boolean;
}

export class GDrive {
  public readonly DEFAULT_FIELDS: FieldsType[] = [
    'createdTime',
    'id',
    'md5Checksum',
    'mimeType',
    'name',
    'parents',
    'trashed',
  ];
  private readonly gdriveAuth: Auth;
  private readonly initiated: Promise<boolean | Error>;
  private readonly MIME_FOLDER = 'application/vnd.google-apps.folder';

  constructor() {
    this.gdriveAuth = new Auth();
    this.initiated = this.gdriveAuth.initiate();
    this.initiated.catch(() => {
      const msg = `${Config.TAG} ERROR! could not get credentials file. GDrive will not work`;
      console.error(msg);
      throw new Error(msg);
    });
  }

  private get auth(): any {
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
      return !!file.trashed;
    }
    return false;
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
    return this.getListFiles(info);
  }

  async getFile(fileId?: string | null): Promise<Schema$File> {
    await this.initiated;
    if (!fileId) {
      return Promise.reject(this.genericError(new Error('File id not found')));
    }
    const info: Params$Resource$Files$Get = { fileId };
    return this.drive.files.get(info)
        .then(({ data }) => data)
        .catch(this.genericError);
  }

  async emptyTrash() {
    await this.initiated;
    return this.drive.files.emptyTrash();
  }

  async deleteFile(file: Schema$File$Modded): Promise<void> {
    await this.initiated;
    return this.drive.files.delete({ fileId: file.id })
        .then(({ data }) => {
          console.warn(`${Config.TAG} Deleted ${file.isFolder ? 'folder' : 'file'}: ${file.name}`);
          return data;
        })
        .catch(this.genericError);
  }

  async uploadFile(
      file: string,
      folderName?: string | boolean,
      options?: UploadOptionsBasic,
  ): Promise<Schema$File$Modded> {
    await this.initiated;
    const { create, replace } = options || {} as any;
    const name = path.basename(file);
    const mimeType = mime.contentType(file) || undefined;
    const requestBody: Schema$File = {
      name,
      mimeType,
    };
    let folderId = null;
    try {
      folderId = await this.getUploadFolderId(folderName || false, create, requestBody);
    } catch (err) {
      return Promise.reject(err);
    }

    try {
      await this.replaceExistingFolder(replace, name, folderId);
    } catch (err) {
      return Promise.reject(err);
    }

    const createOptions: Params$Resource$Files$Create = {
      requestBody,
      media: {
        body: fs.createReadStream(file),
      },
      fields: `kind, ${this.DEFAULT_FIELDS.join(', ')}`,
    };

    const fileSize = fs.statSync(file).size;
    const onUploadProgress = (evt: any) => {
      const progress = (evt.bytesRead / fileSize) * 100;
      if (progress === 100) {
        console.warn(`${Config.TAG} Upload ${name}: ${Math.round(progress)}% complete`);
      }
    };
    return this.drive.files.create(createOptions, { onUploadProgress })
        .then(({ data }) => this.parseFileMeta(data))
        .catch(this.genericError);
  }

  async uploadFiles(
      files: string | string[],
      folderName?: string | boolean,
      options: UploadOptions = {},
  ): Promise<{ [filename: string]: Schema$File$Modded }> {
    await this.initiated;
    const { compress, replace, create } = options;
    if (!Array.isArray(files)) {
      files = [files];
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
    for (const file of uploadFiles) {
      if (file.includes('*')) {
        await this.uploadFiles(glob.sync(file), folderName, options);
      } else if (fs.lstatSync(file).isDirectory()) {
        await this.uploadFiles(glob.sync(`${file}/*`), folderName, options);
      } else {
        const filename = path.basename(file);
        const upFile = await this.uploadFile(file, folderName, { replace, create });
        result[filename] = this.parseFileMeta(upFile);
      }
    }

    return result;
  }

  async cleanOlder(timeSpace: string, folderName?: string): Promise<void> {
    const match = timeSpace.match(/([0-9]+)(\w+)/);
    if (!match) {
      console.error(`${Config.TAG} Unknown timesSpace "${timeSpace}"`);
      return Promise.reject(false);
    }
    await this.initiated;
    let folderId = '';
    if (folderName) {
      try {
        folderId = await this.findFolderId(folderName, false);
      } catch (err) {
        console.error('Could not find folder', folderName, err);
        return Promise.reject(false);
      }
    }
    await this.deleteOlder(match, folderId);
  }

  private getListFiles(info: Params$Resource$Files$List, files: Schema$File[] = []): Promise<Schema$File$Modded[]> {
    return this.drive.files.list(info)
        .then(async ({ data }) => {
          files = files.concat(data.files as Schema$File[]);
          if (data.nextPageToken) {
            info.pageToken = data.nextPageToken;
            return this.getListFiles(info, files);
          } else {
            return files;
          }
        })
        .then((allFiles) => this.parseFilesMeta(allFiles))
        .catch(this.genericError);
  }

  private async replaceExistingFolder(replace: boolean, name: string, folderId: string) {
    if (replace !== undefined) {
      const searchFile = await this.findFile(name, folderId);
      if (searchFile) {
        if (!replace) {
          throw new Error(`${Config.TAG} File "${name}" already exists and will not be replaced`);
        } else {
          console.warn(`${Config.TAG} File "${name}" already exists and will be deleted before upload`);
          await this.deleteFile(searchFile);
        }
      }
    }
  }

  private async getUploadFolderId(
      folderName: string | boolean,
      create: boolean,
      requestBody: drive_v3.Schema$File,
  ) {
    let folderId = '';
    if (folderName && typeof folderName === 'string') {
      folderId = await this.findFolderId(folderName, create === undefined ? true : create);
      if (folderId) {
        requestBody.parents = [folderId];
      } else {
        return Promise.reject(
            new Error(`${Config.TAG} Folder "${folderName}" does not exists and will not be created`));
      }
    }
    return Promise.resolve(folderId);
  }

  private async deleteOlder(match: string[], folderId: string) {
    const files = await this.listFiles();
    if (files && files.length) {
      const [, time, granularity] = match;
      const filtered = files
          .filter((file) => !folderId || (folderId && !file.isFolder))
          .filter((file) => !folderId || (folderId && file.parents && file.parents.includes(folderId)))
          .map((file) => {
            return {
              ...file,
              toDelete: moment(file.createdTime || undefined)
                  .isSameOrBefore(moment().subtract(+time, granularity as moment.unitOfTime.DurationConstructor)),
            };
          })
          .filter((file) => file.toDelete);
      if (filtered && filtered.length) {
        for (const file of filtered) {
          await this.deleteFile(file);
        }
      }
    }
  }

  private parseFileMeta(file: Schema$File): Schema$File$Modded {
    return {
      ...file,
      isDeleted: this.isDeleted(file),
      isFolder: !!this.isFolder(file),
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
      return Promise.resolve(folder[0] || '');
    } else if (create) {
      const createdFolder = await this.createFolder(folderName);
      return Promise.resolve(createdFolder.id || '');
    }
    return Promise.reject(false);
  }

  private async findFile(fileName: string, folderId?: string) {
    const file = (await this.listFiles())
        .filter((file) => !file.isFolder)
        .filter((file) => !file.isDeleted)
        .filter((file) => file.name === fileName)
        .filter((file) => !folderId || file.parents && file.parents.some((folder) => folder === folderId));
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
        if (file.includes('*')) {
          archive.glob(file);
        } else if (fs.lstatSync(file).isDirectory()) {
          archive.directory(file, false);
        } else {
          const name = path.basename(file);
          archive.append(fs.createReadStream(file), { name });
        }
      });

      archive.finalize();
    });
  }
}
