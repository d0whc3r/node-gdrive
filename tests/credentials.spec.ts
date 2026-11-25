import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from '../src/auth';
import Config from '../src/config';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-auth-test-'));
const testCredsFile = path.join(tmpDir, 'credentials.json');
const testTokenFile = path.join(tmpDir, 'nested', 'token.json');
const testServiceAccountFile = path.join(tmpDir, 'service-account.json');

const mockCredentials = {
  installed: {
    client_id: 'mock-client-id',
    project_id: 'mock-project',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_secret: 'mock-client-secret',
    redirect_uris: ['http://127.0.0.1']
  }
};

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

describe('Auth credentials and token lifecycle', () => {
  beforeAll(() => {
    Config.CREDENTIALS_FILE = testCredsFile;
    Config.TOKEN_FILE = testTokenFile;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    silentLogger.info.mockReset();
    silentLogger.warn.mockReset();
    silentLogger.error.mockReset();
  });

  afterAll(() => {
    Config.reset();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects with Error when credentials file is missing', async () => {
    fs.rmSync(testCredsFile, { force: true });
    fs.rmSync(testTokenFile, { force: true });

    const auth = new Auth({ logger: silentLogger });
    expect(auth.ready).toBe(false);
    await expect(auth.initiate()).rejects.toThrow('Credentials file not found');
  });

  it('uses existing token without starting loopback server and persists refreshed tokens with 0o600', async () => {
    fs.writeFileSync(testCredsFile, JSON.stringify(mockCredentials), 'utf8');
    fs.mkdirSync(path.dirname(testTokenFile), { recursive: true });
    fs.writeFileSync(testTokenFile, JSON.stringify({ access_token: 'old', refresh_token: 'keep-me' }), 'utf8');

    const auth = new Auth({ logger: silentLogger });
    expect(auth.ready).toBe(true);
    await expect(auth.initiate()).resolves.toBe(true);

    const client = auth.getAuthClient();
    expect(client).toBeInstanceOf(OAuth2Client);

    // Emit tokens event to verify automatic persistence merges refresh_token and enforces 0o600
    (client as OAuth2Client).emit('tokens', { access_token: 'new-access-token' });
    const saved = JSON.parse(fs.readFileSync(testTokenFile, 'utf8')) as Record<string, unknown>;
    expect(saved.access_token).toBe('new-access-token');
    expect(saved.refresh_token).toBe('keep-me');
    expect(fs.statSync(testTokenFile).mode & 0o777).toBe(0o600);
  });

  it('supports Service Account file and ADC auth modes', async () => {
    fs.writeFileSync(
      testServiceAccountFile,
      JSON.stringify({
        type: 'service_account',
        project_id: 'demo',
        private_key_id: '123',
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n',
        client_email: 'bot@demo.iam.gserviceaccount.com'
      }),
      'utf8'
    );

    const saAuth = new Auth({ serviceAccountFile: testServiceAccountFile, logger: silentLogger });
    expect(saAuth.ready).toBe(true);
    expect(saAuth.isServiceAccountOrADC).toBe(true);
    await expect(saAuth.initiate()).resolves.toBe(true);
    expect(saAuth.getAuthClient()).toBeInstanceOf(GoogleAuth);

    const missingSaAuth = new Auth({ serviceAccountFile: path.join(tmpDir, 'missing-sa.json'), logger: silentLogger });
    expect(missingSaAuth.ready).toBe(false);
    await expect(missingSaAuth.initiate()).rejects.toThrow('Credentials file not found');

    const adcAuth = new Auth({ useADC: true, logger: silentLogger });
    expect(adcAuth.ready).toBe(true);
    await expect(adcAuth.initiate()).resolves.toBe(true);
    expect(adcAuth.getAuthClient()).toBeInstanceOf(GoogleAuth);
  });

  describe('OAuth2 localhost loopback flow', () => {
    beforeEach(() => {
      fs.writeFileSync(testCredsFile, JSON.stringify(mockCredentials), 'utf8');
      fs.rmSync(path.dirname(testTokenFile), { recursive: true, force: true });
    });

    it('completes PKCE loopback flow, creates parent dir (0o700), and writes token (0o600)', async () => {
      const mockToken = { access_token: 'loopback-access', refresh_token: 'loopback-refresh', token_type: 'Bearer' };
      vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({ tokens: mockToken, res: null } as never);

      let capturedAuthUrl = '';
      const logger = {
        info: (...args: unknown[]) => {
          const urlArg = args.find((a) => typeof a === 'string' && a.startsWith('https://'));
          if (typeof urlArg === 'string') {
            capturedAuthUrl = urlArg;
          }
        },
        warn: vi.fn(),
        error: vi.fn()
      };

      const auth = new Auth({ logger });
      const initPromise = auth.initiate();

      // Wait briefly for loopback server to bind and log authUrl
      await vi.waitFor(() => {
        expect(capturedAuthUrl).toContain('code_challenge=');
      });

      const parsedAuth = new URL(capturedAuthUrl);
      const redirectUri = parsedAuth.searchParams.get('redirect_uri')!;
      const state = parsedAuth.searchParams.get('state')!;
      expect(parsedAuth.searchParams.get('code_challenge_method')).toBe('S256');

      const res = await fetch(`${redirectUri}?code=MOCK_AUTH_CODE&state=${state}`);
      expect(res.status).toBe(200);

      await expect(initPromise).resolves.toBe(true);
      expect(fs.existsSync(testTokenFile)).toBe(true);
      expect(fs.statSync(testTokenFile).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(testTokenFile)).mode & 0o777).toBe(0o700);
    });

    it('rejects on OAuth state mismatch', async () => {
      let capturedAuthUrl = '';
      const logger = {
        info: (...args: unknown[]) => {
          const urlArg = args.find((a) => typeof a === 'string' && a.startsWith('https://'));
          if (typeof urlArg === 'string') {
            capturedAuthUrl = urlArg;
          }
        },
        warn: vi.fn(),
        error: vi.fn()
      };

      const auth = new Auth({ logger });
      const initExpectation = expect(auth.initiate()).rejects.toThrow('OAuth state mismatch');

      await vi.waitFor(() => {
        expect(capturedAuthUrl).toContain('redirect_uri=');
      });

      const parsedAuth = new URL(capturedAuthUrl);
      const redirectUri = parsedAuth.searchParams.get('redirect_uri')!;
      const res = await fetch(`${redirectUri}?code=MOCK_AUTH_CODE&state=wrong-state`);
      expect(res.status).toBe(400);

      await initExpectation;
    });

    it('rejects when token exchange fails', async () => {
      vi.spyOn(OAuth2Client.prototype, 'getToken').mockRejectedValue(new Error('invalid_grant'));

      let capturedAuthUrl = '';
      const logger = {
        info: (...args: unknown[]) => {
          const urlArg = args.find((a) => typeof a === 'string' && a.startsWith('https://'));
          if (typeof urlArg === 'string') {
            capturedAuthUrl = urlArg;
          }
        },
        warn: vi.fn(),
        error: vi.fn()
      };

      const auth = new Auth({ logger });
      const initExpectation = expect(auth.initiate()).rejects.toThrow('invalid_grant');

      await vi.waitFor(() => {
        expect(capturedAuthUrl).toContain('redirect_uri=');
      });

      const parsedAuth = new URL(capturedAuthUrl);
      const redirectUri = parsedAuth.searchParams.get('redirect_uri')!;
      const state = parsedAuth.searchParams.get('state')!;
      const res = await fetch(`${redirectUri}?code=BAD_CODE&state=${state}`);
      expect(res.status).toBe(500);

      await initExpectation;
    });
  });
});
