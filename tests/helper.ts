import * as fs from 'fs';
import Config from '../src/config';

export const isCI = !!process.env.CI || !!process.env.CI_JOB_ID || false;
export const DEFAULT_TIMEOUT = 15000;

export function deleteCredentialsFile() {
  if (isCI) {
    try {
      console.info('[test] Deleting CREDENTIALS_FILE');
      fs.unlinkSync(Config.CREDENTIALS_FILE);
    } catch (err) {
      console.warn('[test] No CREDENTIALS_FILE to delete');
    }
  }
}

export function createCredentialsFile() {
  if (isCI) {
    deleteCredentialsFile();
    const content = process.env.CREDENTIALS_JSON || '{}';
    console.info('[test] Creating CREDENTIALS_FILE');
    fs.writeFileSync(Config.CREDENTIALS_FILE, content, { encoding: 'utf8', flag: 'w' });
  }
}

export function deleteTokenFile() {
  if (isCI) {
    try {
      console.info('[test] Deleting TOKEN_FILE');
      fs.unlinkSync(Config.TOKEN_FILE);
    } catch (err) {
      console.warn('[test] No TOKEN_FILE to delete');
    }
  }
}

export function createTokenFile() {
  if (isCI) {
    deleteTokenFile();
    const content = process.env.TOKEN_JSON || '{}';
    console.info('[test] Creating TOKEN_FILE');
    fs.writeFileSync(Config.TOKEN_FILE, content, { encoding: 'utf8', flag: 'w' });
  }
}
