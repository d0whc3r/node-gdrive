export default class Config {
  private static _tokenFile?: string;
  private static _credentialsFile?: string;
  private static _serviceAccountFile?: string;
  private static _tag?: string;

  public static get TOKEN_FILE(): string {
    return this._tokenFile ?? process.env.TOKEN_FILE ?? './secrets/token.json';
  }

  public static set TOKEN_FILE(value: string) {
    this._tokenFile = value;
  }

  public static get CREDENTIALS_FILE(): string {
    return this._credentialsFile ?? process.env.CREDENTIALS_FILE ?? './secrets/credentials.json';
  }

  public static set CREDENTIALS_FILE(value: string) {
    this._credentialsFile = value;
  }

  public static get SERVICE_ACCOUNT_FILE(): string | undefined {
    return this._serviceAccountFile ?? process.env.SERVICE_ACCOUNT_FILE ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  public static set SERVICE_ACCOUNT_FILE(value: string | undefined) {
    this._serviceAccountFile = value;
  }

  public static get BACKUP_ENCRYPTION_KEY(): string | undefined {
    return process.env.BACKUP_ENCRYPTION_KEY || undefined;
  }

  public static get TAG(): string {
    return this._tag ?? '[node-gdrive]';
  }

  public static set TAG(value: string) {
    this._tag = value;
  }

  public static reset(): void {
    this._tokenFile = undefined;
    this._credentialsFile = undefined;
    this._serviceAccountFile = undefined;
    this._tag = undefined;
  }
}
