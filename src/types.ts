import { drive_v3 } from 'googleapis';
import Params$Resource$Files$Get = drive_v3.Params$Resource$Files$Get;
import Params$Resource$Files$List = drive_v3.Params$Resource$Files$List;
import Params$Resource$Files$Create = drive_v3.Params$Resource$Files$Create;

export { Params$Resource$Files$Create, Params$Resource$Files$Get, Params$Resource$Files$List };

export type FieldsType =
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
export const allFileTypes: FieldsType[] = [
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
];

export interface Schema$File$Modded extends drive_v3.Schema$File {
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

export interface Installed {
  client_id: string;
  project_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_secret: string;
  redirect_uris: string[];
}

export interface CredentialsFile {
  installed: Installed;
}

export interface TokenFile {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}
