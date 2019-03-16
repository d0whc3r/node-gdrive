import * as fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as readline from 'readline';
import Config from '@/config';

export default class Auth {
  public ready = true;
  private SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file', // File create/open
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/drive.metadata.readonly', // file metadata (readonly)
  ];
  private TOKEN_FILE = Config.TOKEN_FILE;
  private CREDENTIALS_FILE = Config.CREDENTIALS_FILE;
  private _oAuth2Client: OAuth2Client = null;

  constructor() {
    if (!this.existsCredentials) {
      this.ready = false;
      console.error(`${Config.TAG} ERROR: Credentials file not found in ${this.CREDENTIALS_FILE}`.red.bold);
    }
  }

  private get existsToken() {
    return fs.existsSync(this.TOKEN_FILE);
  }

  private get existsCredentials() {
    return fs.existsSync(this.CREDENTIALS_FILE);
  }

  public async initiate(): Promise<boolean | Error> {
    if (!this.ready) {
      return Promise.reject(false);
    }
    if (!this.existsToken) {
      return this.generateAccessToken();
    }
    return Promise.resolve(true);
  }

  public oAuth2Client(withToken = true): OAuth2Client {
    if (!this._oAuth2Client) {
      const credentials = JSON.parse(fs.readFileSync(this.CREDENTIALS_FILE, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed;
      this._oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      if (withToken) {
        const token = JSON.parse(fs.readFileSync(this.TOKEN_FILE, 'utf8'));
        this._oAuth2Client.setCredentials(token);
      }
    }
    return this._oAuth2Client;
  }

  private generateAccessToken(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const authUrl = this.oAuth2Client(false).generateAuthUrl({
        access_type: 'offline',
        scope: this.SCOPES,
      });
      // tslint:disable-next-line:no-console
      console.log(`${Config.TAG} Authorize this app by visiting this url:`, authUrl);
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(`${Config.TAG} Enter the code from that page here: `, (code) => {
        rl.close();
        this.oAuthGetToken(code, { resolve, reject });
      });
    });
  }

  private oAuthGetToken(code, { resolve, reject }) {
    this.oAuth2Client(false).getToken(code, (err, token) => {
      if (err) {
        console.error(`${Config.TAG} Error retrieving access token`.red.bold, err);
        reject(err);
      } else {
        this.oAuth2Client(false).setCredentials(token);
        this.writeToken(token, { resolve, reject });
      }
    });
  }

  private writeToken(token, { resolve, reject }): void {
    fs.writeFile(this.TOKEN_FILE, JSON.stringify(token), (err) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        // tslint:disable-next-line:no-console
        console.log(`${Config.TAG} Token stored to`, this.TOKEN_FILE);
        resolve(true);
      }
    });
  }
}
