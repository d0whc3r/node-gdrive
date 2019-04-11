import * as fs from 'fs';
import { google } from 'googleapis';
import { GetTokenResponse } from 'google-auth-library/build/src/auth/oauth2client';
import { Credentials } from 'google-auth-library/build/src/auth/credentials';
import * as readline from 'readline';
import * as colors from 'colors';
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
  private _oAuth2Client: any = null;

  constructor() {
    if (!this.existsCredentials) {
      this.ready = false;
      console.error(colors.bold(`${Config.TAG} ERROR: Credentials file not found in ${this.CREDENTIALS_FILE}`).red);
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

  public oAuth2Client(withToken = true) {
    if (!this._oAuth2Client) {
      const credentials = JSON.parse(fs.readFileSync(this.CREDENTIALS_FILE, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed;
      this._oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]) as any;
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
        this.oAuthGetToken(code, { resolve, reject } as PromiseConstructor);
      });
    });
  }

  private oAuthGetToken(code: string, promise: PromiseConstructor) {
    this.oAuth2Client(false).getToken(code)
        .then(({ tokens }: GetTokenResponse) => {
          this.oAuth2Client(false).setCredentials(tokens);
          this.writeToken(tokens, promise);
        })
        .catch((err: any) => {
          console.error(colors.bold(`${Config.TAG} Error retrieving access token`).red, err);
          return promise.reject(err);
        });
  }

  private writeToken(token: Credentials, { resolve, reject }: PromiseConstructor): void {
    fs.writeFile(this.TOKEN_FILE, JSON.stringify(token), (err) => {
      if (err) {
        console.error(err);
        return reject(err);
      } else {
        // tslint:disable-next-line:no-console
        console.log(`${Config.TAG} Token stored to`, this.TOKEN_FILE);
        return resolve(true);
      }
    });
  }
}
