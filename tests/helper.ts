import * as fs from 'fs';

export const isCI = !!process.env.CI || false;
export const DEFAULT_TIMEOUT = 15000;

export function createCredentialsFile() {
  if (isCI) {
    const content = process.env.CREDENTIALS_JSON || '{}';
    const path = './secrets/credentials.json';
    fs.writeFileSync(path, content, { encoding: 'utf8', flag: 'w' });
  }
}

export function createTokenFile() {
  if (isCI) {
    const content = process.env.TOKEN_JSON || '{}';
    const path = './secrets/token.json';
    fs.writeFileSync(path, content, { encoding: 'utf8', flag: 'w' });
  }
}
