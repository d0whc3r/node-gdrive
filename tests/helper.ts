import * as fs from 'fs';
import Config from '../src/config';

export const isCI = !!process.env.CI || false;
export const DEFAULT_TIMEOUT = 15000;

export function createCredentialsFile() {
  if (isCI) {
    fs.unlinkSync(Config.CREDENTIALS_FILE);
    const content = process.env.CREDENTIALS_JSON || '{}';
    const path = './secrets/credentials.json';
    fs.writeFileSync(path, content, { encoding: 'utf8', flag: 'w' });
  }
}

export function createTokenFile() {
  if (isCI) {
    fs.unlinkSync(Config.TOKEN_FILE);
    const content = process.env.TOKEN_JSON || '{}';
    const path = './secrets/token.json';
    fs.writeFileSync(path, content, { encoding: 'utf8', flag: 'w' });
  }
}
