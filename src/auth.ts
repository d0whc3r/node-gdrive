import * as fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as readline from 'readline';
import Config from '@/config';

export default class Auth {
  private SCOPES = [
    'https://www.googleapis.com/auth/drive.file', // File create/open
    'https://www.googleapis.com/auth/drive.metadata.readonly', // file metadata (readonly)
  ];
  private TOKEN_FILE = Config.TOKEN_FILE;
  private CREDENTIALS_FILE = Config.CREDENTIALS_FILE;
  private _oAuth2Client: OAuth2Client = null;
  public ready = true;

  constructor() {
    if (!this.existsCredentials) {
      this.ready = false;
      console.error(`[node-gdrive] ERROR: Credentials file not found in ${this.CREDENTIALS_FILE}`);
    }
  }

  public initiate(): Promise<boolean | Error> {
    if (!this.ready) {
      return Promise.reject(false);
    }
    if (!this.existsToken) {
      return this.generateAccessToken();
    }
    return Promise.resolve(true);
  }

  private get existsToken() {
    return fs.existsSync(this.TOKEN_FILE);
  }

  private get existsCredentials() {
    return fs.existsSync(this.CREDENTIALS_FILE);
  }

  public get oAuth2Client(): OAuth2Client {
    if (!this._oAuth2Client) {
      const credentials = JSON.parse(fs.readFileSync(this.CREDENTIALS_FILE, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed;
      this._oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      const token = JSON.parse(fs.readFileSync(this.TOKEN_FILE, 'utf8'));
      this._oAuth2Client.setCredentials(token);
    }
    return this._oAuth2Client;
  }

  private generateAccessToken(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const authUrl = this.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.SCOPES,
      });
      // tslint:disable-next-line:no-console
      console.log('[node-gdrive] Authorize this app by visiting this url:', authUrl);
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('[node-gdrive] Enter the code from that page here: ', (code) => {
        rl.close();
        this.oAuthGetToken(code, { reject, resolve });
      });
    });
  }

  private oAuthGetToken(code, { reject, resolve }) {
    this.oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('[node-gdrive] Error retrieving access token', err);
        reject(err);
      } else {
        this.oAuth2Client.setCredentials(token);
        this.writeToken(token, { reject, resolve });
      }
    });
  }

  private writeToken(token, { reject, resolve }): void {
    fs.writeFile(this.TOKEN_FILE, JSON.stringify(token), (err) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        // tslint:disable-next-line:no-console
        console.log('[node-gdrive] Token stored to', this.TOKEN_FILE);
        resolve(true);
      }
    });
  }
}
