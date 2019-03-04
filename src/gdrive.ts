import Auth from '@/auth';
import { drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import Schema$File = drive_v3.Schema$File;
import Params$Resource$Files$Get = drive_v3.Params$Resource$Files$Get;
import Params$Resource$Files$List = drive_v3.Params$Resource$Files$List;
import Schema$FileList = drive_v3.Schema$FileList;

export type fieldsType = 'kind'
    | 'id'
    | 'name'
    | 'mimeType'
    | 'description'
    | 'starred'
    | 'trashed'
    | 'explicitlyTrashed'
    | 'trashingUser'
    | 'trashedTime'
    | 'parents'
    | 'properties'
    | 'appProperties'
    | 'spaces'
    | 'version'
    | 'webContentLink'
    | 'webViewLink'
    | 'iconLink'
    | 'hasThumbnail'
    | 'thumbnailLink'
    | 'thumbnailVersion'
    | 'viewedByMe'
    | 'viewedByMeTime'
    | 'createdTime'
    | 'modifiedTime'
    | 'modifiedByMeTime'
    | 'modifiedByMe'
    | 'sharedWithMeTime'
    | 'sharingUser'
    | 'owners'
    | 'teamDriveId'
    | 'lastModifyingUser'
    | 'shared'
    | 'ownedByMe'
    | 'capabilities'
    | 'viewersCanCopyContent'
    | 'writersCanShare'
    | 'hasAugmentedPermissions'
    | 'folderColorRgb'
    | 'originalFilename'
    | 'fullFileExtension'
    | 'fileExtension'
    | 'md5Checksum'
    | 'size'
    | 'quotaBytesUsed'
    | 'headRevisionId'
    | 'contentHints'
    | 'imageMediaMetadata'
    | 'videoMediaMetadata'
    | 'isAppAuthorized';

const allFileTypes: fieldsType[] = [
  'id',
  'name',
  'mimeType',
  'description',
  'starred',
  'trashed',
  'explicitlyTrashed',
  'trashingUser',
  'trashedTime',
  'parents',
  'properties',
  'appProperties',
  'spaces',
  'version',
  'webContentLink',
  'webViewLink',
  'iconLink',
  'hasThumbnail',
  'thumbnailLink',
  'thumbnailVersion',
  'viewedByMe',
  'viewedByMeTime',
  'createdTime',
  'modifiedTime',
  'modifiedByMeTime',
  'modifiedByMe',
  'sharedWithMeTime',
  'sharingUser',
  'owners',
  'teamDriveId',
  'lastModifyingUser',
  'shared',
  'ownedByMe',
  'capabilities',
  'viewersCanCopyContent',
  'writersCanShare',
  'hasAugmentedPermissions',
  'folderColorRgb',
  'originalFilename',
  'fullFileExtension',
  'fileExtension',
  'md5Checksum',
  'size',
  'quotaBytesUsed',
  'headRevisionId',
  'contentHints',
  'imageMediaMetadata',
  'videoMediaMetadata',
  'isAppAuthorized',
];

export default class Gdrive {
  private gdriveAuth: Auth;
  private readonly initiated: Promise<boolean | Error>;

  constructor() {
    this.gdriveAuth = new Auth();
    this.initiated = this.gdriveAuth.initiate();
  }

  private get auth(): OAuth2Client {
    return this.gdriveAuth.oAuth2Client;
  }

  private get drive() {
    return google.drive({ version: 'v3', auth: this.auth });
  }

  public isFolder(file: Schema$File) {
    if (file.hasOwnProperty('mimeType')) {
      return file.mimeType === 'application/vnd.google-apps.folder';
    }
    return undefined;
  }

  async listFiles(fields?: boolean | fieldsType[], pageSize = 10): Promise<Schema$FileList> {
    await this.initiated;
    if (!fields) {
      fields = ['id', 'name', 'mimeType'];
    } else if (fields === true) {
      fields = allFileTypes;
    }
    const info: Params$Resource$Files$List = {
      pageSize,
      fields: `kind, nextPageToken, incompleteSearch, files(${fields.join(', ')})`,
    };
    return this.drive.files.list(info)
        .then(({ data }) => data)
        .catch((err) => {
          console.error('[node-gdrive] The API returned an error: ' + err);
          return err;
        });
  }

  async getFile(fileId: string): Promise<Schema$File> {
    await this.initiated;
    const info: Params$Resource$Files$Get = { fileId };
    return this.drive.files.get(info)
        .then(({ data }) => data)
        .catch((err) => {
          console.error('[node-gdrive] The API returned an error: ' + err);
          return err;
        });
  }
}
