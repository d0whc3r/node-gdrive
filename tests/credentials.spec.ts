import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import readline from 'node:readline';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from '../src/auth';
import Config from '../src/config';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-test-'));
const testCredsFile = path.join(tmpDir, 'credentials.json');
const testTokenFile = path.join(tmpDir, 'token.json');

const mockCredentials = {
  installed: {
    client_id: 'mock-client-id',
    project_id: 'mock-project',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_secret: 'mock-client-secret',
    redirect_uris: ['urn:ietf:wg:oauth:2.0:oob', 'http://localhost']
  }
};

describe('Check credentials', () => {
  const originalCreds = Config.CREDENTIALS_FILE;
  const originalToken = Config.TOKEN_FILE;

  beforeAll(() => {
    Config.CREDENTIALS_FILE = testCredsFile;
    Config.TOKEN_FILE = testTokenFile;
  });

  afterAll(() => {
    Config.CREDENTIALS_FILE = originalCreds;
    Config.TOKEN_FILE = originalToken;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Credentials file is not present', async () => {
    fs.rmSync(testCredsFile, { force: true });
    fs.rmSync(testTokenFile, { force: true });
    const auth = new Auth();
    expect(auth.ready).toBeFalsy();
    expect(auth).toBeDefined();
    await expect(auth.initiate()).rejects.toBe(false);
  });

  describe('Credentials is present', () => {
    let auth: Auth;

    beforeEach(() => {
      vi.restoreAllMocks();
      fs.writeFileSync(testCredsFile, JSON.stringify(mockCredentials), 'utf8');
      fs.rmSync(testTokenFile, { force: true });
      auth = new Auth();
      expect(auth.ready).toBeTruthy();

      vi.spyOn(readline, 'createInterface').mockReturnValue({
        question: (_prompt: string, cb: (answer: string) => void) => cb('1234567890TOKEN_MOCK'),
        close: vi.fn()
      } as unknown as readline.Interface);
    });

    it('Access token invalid', async () => {
      const client = auth.oAuth2Client(false);
      vi.spyOn(client, 'getToken').mockRejectedValue(new Error('invalid_grant'));

      await expect(auth.initiate()).rejects.toThrow('invalid_grant');
    });

    it('Generate access token (mocked response)', async () => {
      const client = auth.oAuth2Client(false);
      const mockToken = { access_token: 'mocked', token_type: 'Bearer' };
      vi.spyOn(client, 'getToken').mockResolvedValue({ tokens: mockToken, res: null } as never);

      const data = await auth.initiate();
      expect(data).toBe(true);
      expect(fs.existsSync(testTokenFile)).toBeTruthy();
    });
  });
});
