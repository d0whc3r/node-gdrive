import Auth from '../src/auth';
import { createCredentialsFile, DEFAULT_TIMEOUT } from './helper';
// @ts-ignore
import { stdin } from 'mock-stdin';
import * as nock from 'nock';
import * as fs from 'fs';
import Config from '../src/config';

let auth: Auth;
describe('Check credentials', () => {
  beforeAll(() => {
    auth = new Auth();
  });

  it('Credentials file is not present', async () => {
    expect(auth.ready).toBeFalsy();
    expect(auth).toBeDefined();
    try {
      await auth.initiate();
      fail('Auth should not be initialized');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  describe('Credentials is present', () => {
    const mockStdIn = stdin();

    beforeAll(() => {
      createCredentialsFile();
      expect(fs.existsSync(Config.CREDENTIALS_FILE)).toBeTruthy();
      auth = new Auth();
      expect(auth.ready).toBeTruthy();
      expect(mockStdIn).toBeDefined();
    });

    it('Access token invalid', (done) => {
      expect(auth).toBeDefined();
      expect(mockStdIn).toBeDefined();

      nock('https://oauth2.googleapis.com')
          .post('/token')
          .reply(400, { error: 'mocked token' });
      const resultPromise = auth.initiate();
      setTimeout(() => {
        mockStdIn.send('1234567890TOKEN_MOCK\n');
        mockStdIn.end();
      }, 3000);
      resultPromise
          .then(() => {
            fail('token should be invalid');
          })
          .catch((err) => {
            expect(err).toBeDefined();
          })
          .finally(done);
    }, DEFAULT_TIMEOUT);

    it('Generate access token (mocked response)', (done) => {
      expect(auth).toBeDefined();
      expect(mockStdIn).toBeDefined();
      nock('https://oauth2.googleapis.com')
          .post('/token')
          .reply(200, JSON.parse(process.env.TOKEN_JSON || '{ "token": "mocked" }'));

      const resultPromise = auth.initiate();
      setTimeout(() => {
        mockStdIn.send('1234567890TOKEN_MOCK\n');
        mockStdIn.end();
      }, 3000);
      resultPromise
          .then((data) => {
            expect(data).toBeDefined();
            expect(fs.existsSync(Config.TOKEN_FILE)).toBeTruthy();
          })
          .catch(() => {
            fail('Mocked response should be valid');
          })
          .finally(done);
    }, DEFAULT_TIMEOUT);
  });

});
