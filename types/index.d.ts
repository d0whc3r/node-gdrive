/// <reference types="node" />

export declare type FieldsType = 'appProperties' | 'capabilities' | 'contentHints' | 'createdTime' | 'description' | 'explicitlyTrashed' | 'fileExtension' | 'folderColorRgb' | 'fullFileExtension' | 'hasAugmentedPermissions' | 'hasThumbnail' | 'headRevisionId' | 'iconLink' | 'id' | 'imageMediaMetadata' | 'isAppAuthorized' | 'kind' | 'lastModifyingUser' | 'md5Checksum' | 'mimeType' | 'modifiedByMe' | 'modifiedByMeTime' | 'modifiedTime' | 'name' | 'originalFilename' | 'ownedByMe' | 'owners' | 'parents' | 'properties' | 'quotaBytesUsed' | 'shared' | 'sharedWithMeTime' | 'sharingUser' | 'size' | 'spaces' | 'starred' | 'teamDriveId' | 'thumbnailLink' | 'thumbnailVersion' | 'trashed' | 'trashedTime' | 'trashingUser' | 'version' | 'videoMediaMetadata' | 'viewedByMe' | 'viewedByMeTime' | 'viewersCanCopyContent' | 'webContentLink' | 'webViewLink' | 'writersCanShare';
export interface Schema$File$Modded extends Schema$File {
	isDeleted: boolean;
	isFolder: boolean;
}
export default class GDrive {
	readonly DEFAULT_FIELDS: FieldsType[];
	private gdriveAuth;
	private readonly initiated;
	private readonly MIME_FOLDER;
	constructor();
	private readonly auth;
	private readonly drive;
	isFolder(file: Schema$File): boolean;
	isDeleted(file: Schema$File): boolean;
	listFiles(fields?: boolean | FieldsType[], pageSize?: number): Promise<Schema$File$Modded[]>;
	getFile(fileId: string): Promise<Schema$File>;
	emptyTrash(): Promise<void>;
	deleteFile(file: Schema$File$Modded): Promise<void>;
	uploadFile(file: string, folderName?: string | boolean, options?: {
		create?: boolean;
		replace?: boolean;
	}): Promise<Schema$File>;
	uploadFiles(files: string[], folderName?: string | boolean, options?: {
		compress?: string | boolean;
		replace?: boolean;
		create?: boolean;
	}): Promise<{
		[filename: string]: Schema$File$Modded;
	}>;
	cleanOlder(timeSpace: string, folderName?: string): Promise<void>;
	private parseFileMeta;
	private parseFilesMeta;
	private genericError;
	private findFolderId;
	private findFile;
	private createFolder;
	private compressFiles;
}

export as namespace gdrive;
