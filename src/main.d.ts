import { drive_v3 } from 'googleapis';
import Schema$File = drive_v3.Schema$File;

export declare class GDrive {
  readonly DEFAULT_FIELDS: FieldsType[];
  private readonly gdriveAuth;
  private readonly initiated;
  private readonly MIME_FOLDER;

  constructor();

  private get auth();

  private get drive();

  isFolder(file: Schema$File): boolean | undefined;

  isDeleted(file: Schema$File): boolean;

  listFiles(fields?: boolean | FieldsType[], pageSize?: number): Promise<Schema$File$Modded[]>;

  getFile(fileId?: string | null): Promise<drive_v3.Schema$File>;

  emptyTrash(): Promise<import('gaxios').GaxiosResponse<void>>;

  deleteFile(file: Schema$File$Modded): Promise<void>;

  uploadFile(file: string, folderName?: string | boolean, options?: UploadOptionsBasic): Promise<Schema$File$Modded>;

  uploadFiles(
    files: string | string[],
    folderName?: string | boolean,
    options?: UploadOptions
  ): Promise<{
    [filename: string]: Schema$File$Modded;
  }>;

  cleanOlder(timeSpace: string, folderName?: string): Promise<void>;

  private getListFiles;
  private replaceExistingFolder;
  private getUploadFolderId;
  private deleteOlder;
  private parseFileMeta;
  private parseFilesMeta;
  private genericError;
  private findFolderId;
  private findFile;
  private createFolder;
  private compressFiles;
}

export declare type FieldsType =
  | 'appProperties'
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

export interface Schema$File$Modded extends Schema$File {
  isDeleted: boolean;
  isFolder: boolean;
  parentFolder?: string;
}

export interface UploadOptions extends UploadOptionsBasic {
  compress?: string | boolean;
}

export interface UploadOptionsBasic {
  create?: boolean;
  replace?: boolean;
}

export {};
