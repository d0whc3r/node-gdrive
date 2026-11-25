import type { drive_v3 } from '@googleapis/drive';
import type { GoogleAuth, OAuth2Client } from 'google-auth-library';

export type Params$Resource$Files$Get = drive_v3.Params$Resource$Files$Get;
export type Params$Resource$Files$List = drive_v3.Params$Resource$Files$List;
export type Params$Resource$Files$Create = drive_v3.Params$Resource$Files$Create;
export type Params$Resource$Files$Delete = drive_v3.Params$Resource$Files$Delete;

export const allFileTypes = [
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
  'writersCanShare'
] as const;

export type FieldsType = (typeof allFileTypes)[number];

export interface Schema$File$Modded extends drive_v3.Schema$File {
  isDeleted: boolean;
  isFolder: boolean;
  parentFolder?: string;
}

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface UploadProgressEvent {
  fileName: string;
  bytesRead: number;
  totalBytes: number;
  percentage: number;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  sleep?: (ms: number) => Promise<void>;
}

export interface AuthConfig {
  credentialsFile?: string;
  tokenFile?: string;
  serviceAccountFile?: string;
  useADC?: boolean;
  scopes?: string[];
  logger?: Logger;
}

export interface GDriveConfig extends AuthConfig {
  sharedDriveId?: string;
  dryRun?: boolean;
  concurrency?: number;
  compressionLevel?: number;
  onProgress?: (event: UploadProgressEvent) => void;
  retry?: RetryOptions;
  auth?: OAuth2Client | GoogleAuth;
  drive?: drive_v3.Drive;
}

export interface UploadOptionsBasic {
  create?: boolean;
  replace?: boolean;
  dryRun?: boolean;
  encryptKey?: string;
  onProgress?: (event: UploadProgressEvent) => void;
}

export interface UploadOptions extends UploadOptionsBasic {
  compress?: string | boolean;
  compressionLevel?: number;
  exclude?: string[];
  followSymlinks?: boolean;
  concurrency?: number;
}

export interface UploadStreamOptions extends UploadOptionsBasic {
  mimeType?: string;
  size?: number;
}

export interface CleanOlderOptions {
  dryRun?: boolean;
  keepLast?: number;
  concurrency?: number;
}

export interface DownloadOptions {
  decryptKey?: string;
  folderName?: string;
}

export interface Installed {
  client_id: string;
  project_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_secret: string;
  redirect_uris?: string[];
}

export interface CredentialsFile {
  installed?: Installed;
  web?: Installed;
}

export interface TokenFile {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}
