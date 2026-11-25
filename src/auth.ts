import crypto from 'node:crypto';
import * as fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { styleText } from 'node:util';
import { CodeChallengeMethod, Credentials, GoogleAuth, OAuth2Client } from 'google-auth-library';
import Config from './config';
import type { AuthConfig, CredentialsFile, Logger, TokenFile } from './types';

export const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/drive'];

export default class Auth {
  public ready = true;
  private readonly scopes: string[];
  private readonly tokenFile: string;
  private readonly credentialsFile: string;
  private readonly serviceAccountFile?: string;
  private readonly useADC: boolean;
  private readonly logger: Logger;
  private _oAuth2Client?: OAuth2Client;
  private _googleAuth?: GoogleAuth;

  constructor(config: AuthConfig = {}) {
    this.tokenFile = config.tokenFile ?? Config.TOKEN_FILE;
    this.credentialsFile = config.credentialsFile ?? Config.CREDENTIALS_FILE;
    this.serviceAccountFile = config.serviceAccountFile ?? Config.SERVICE_ACCOUNT_FILE;
    this.useADC = config.useADC ?? false;
    this.scopes = config.scopes ?? DEFAULT_SCOPES;
    this.logger = config.logger ?? console;

    if (this.serviceAccountFile) {
      if (!fs.existsSync(this.serviceAccountFile)) {
        this.ready = false;
        this.logger.error(styleText(['bold', 'red'], `${Config.TAG} ERROR: Service account file not found in ${this.serviceAccountFile}`));
      }
    } else if (!this.useADC && !this.existsCredentials) {
      this.ready = false;
      this.logger.error(styleText(['bold', 'red'], `${Config.TAG} ERROR: Credentials file not found in ${this.credentialsFile}`));
    }
  }

  public get isServiceAccountOrADC(): boolean {
    return Boolean(this.serviceAccountFile) || this.useADC;
  }

  private get existsToken(): boolean {
    return fs.existsSync(this.tokenFile);
  }

  private get existsCredentials(): boolean {
    return fs.existsSync(this.credentialsFile);
  }

  public async initiate(): Promise<boolean> {
    if (!this.ready) {
      const target = this.serviceAccountFile ?? this.credentialsFile;
      throw new Error(`${Config.TAG} Credentials file not found in ${target}`);
    }
    if (this.isServiceAccountOrADC) {
      this.googleAuthClient();
      return true;
    }
    if (!this.existsToken) {
      return this.generateAccessToken();
    }
    this.oAuth2Client(true);
    return true;
  }

  public getAuthClient(): OAuth2Client | GoogleAuth {
    if (this.isServiceAccountOrADC) {
      return this.googleAuthClient();
    }
    return this.oAuth2Client(true);
  }

  public googleAuthClient(): GoogleAuth {
    if (!this._googleAuth) {
      if (this.serviceAccountFile) {
        const credentials = JSON.parse(fs.readFileSync(this.serviceAccountFile, 'utf8')) as Record<string, unknown>;
        this._googleAuth = new GoogleAuth({
          credentials,
          scopes: this.scopes
        });
      } else {
        this._googleAuth = new GoogleAuth({
          scopes: this.scopes
        });
      }
    }
    return this._googleAuth;
  }

  public oAuth2Client(withToken = true, redirectUri?: string): OAuth2Client {
    if (!this._oAuth2Client) {
      const credentials = JSON.parse(fs.readFileSync(this.credentialsFile, 'utf8')) as CredentialsFile;
      const clientConfig = credentials.installed ?? credentials.web;
      if (!clientConfig) {
        throw new Error(`${Config.TAG} Invalid credentials file format in ${this.credentialsFile}`);
      }
      const { client_secret, client_id, redirect_uris } = clientConfig;
      this._oAuth2Client = new OAuth2Client(client_id, client_secret, redirectUri ?? redirect_uris?.[0] ?? 'http://127.0.0.1');
      this.attachTokenListener(this._oAuth2Client);
      if (withToken && this.existsToken) {
        const token = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8')) as TokenFile;
        this._oAuth2Client.setCredentials(token);
      }
    }
    return this._oAuth2Client;
  }

  private attachTokenListener(client: OAuth2Client): void {
    client.on('tokens', (tokens: Credentials) => {
      try {
        let existing: TokenFile = {};
        if (this.existsToken) {
          existing = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8')) as TokenFile;
        }
        const merged: Credentials = {
          ...existing,
          ...tokens,
          refresh_token: tokens.refresh_token ?? existing.refresh_token
        };
        this.persistTokenSync(merged);
      } catch (err) {
        this.logger.warn(`${Config.TAG} Failed to persist refreshed token:`, err);
      }
    });
  }

  private persistTokenSync(token: Credentials): void {
    fs.mkdirSync(path.dirname(this.tokenFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.tokenFile, JSON.stringify(token, null, 2), { mode: 0o600 });
    fs.chmodSync(this.tokenFile, 0o600);
  }

  private async generateAccessToken(): Promise<boolean> {
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return new Promise<boolean>((resolve, reject) => {
      const server = http.createServer();
      let settled = false;

      const finish = (fn: () => void) => {
        if (!settled) {
          settled = true;
          server.close();
          fn();
        }
      };

      server.on('error', (err) => {
        finish(() => reject(new Error(`${Config.TAG} OAuth loopback server failed`, { cause: err })));
      });

      server.on('request', (req, res) => {
        void (async () => {
          try {
            const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (reqUrl.pathname !== '/oauth2callback') {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Not found');
              return;
            }
            const returnedState = reqUrl.searchParams.get('state');
            const code = reqUrl.searchParams.get('code');
            const oauthError = reqUrl.searchParams.get('error');

            if (oauthError) {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end(`Authorization failed: ${oauthError}`);
              finish(() => reject(new Error(`${Config.TAG} OAuth authorization error: ${oauthError}`)));
              return;
            }
            if (!returnedState || returnedState !== state) {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Invalid OAuth state parameter');
              finish(() => reject(new Error(`${Config.TAG} OAuth state mismatch`)));
              return;
            }
            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Missing authorization code');
              finish(() => reject(new Error(`${Config.TAG} Missing OAuth authorization code`)));
              return;
            }

            const addr = server.address() as AddressInfo;
            const redirectUri = `http://127.0.0.1:${addr.port}/oauth2callback`;
            const client = this.oAuth2Client(false, redirectUri);
            const { tokens } = await client.getToken({
              code,
              codeVerifier,
              redirect_uri: redirectUri
            });
            client.setCredentials(tokens);
            this.persistTokenSync(tokens);

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Authentication successful! You can close this window.');
            this.logger.info(`${Config.TAG} Token stored to`, this.tokenFile);
            finish(() => resolve(true));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error exchanging OAuth authorization code.');
            finish(() => reject(err instanceof Error ? err : new Error(String(err))));
          }
        })();
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        const redirectUri = `http://127.0.0.1:${addr.port}/oauth2callback`;
        const client = this.oAuth2Client(false, redirectUri);
        const authUrl = client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: this.scopes,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256
        });
        this.logger.info(`${Config.TAG} Authorize this app by visiting this url:`, authUrl);
      });
    });
  }
}
