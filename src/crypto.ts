import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('NGDE', 'ascii');
const VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HEADER_LENGTH = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  if (!passphrase) {
    throw new Error('Encryption passphrase must not be empty');
  }
  return crypto.scryptSync(passphrase, salt, KEY_LENGTH);
}

export function encryptBuffer(plaintext: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv, encrypted, authTag]);
}

export function decryptBuffer(payload: Buffer, passphrase: string): Buffer {
  if (payload.length < HEADER_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted payload is too short or corrupted');
  }
  const magic = payload.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error('Invalid encrypted file header');
  }
  const version = payload[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption format version: ${String(version)}`);
  }
  const saltStart = MAGIC.length + 1;
  const ivStart = saltStart + SALT_LENGTH;
  const salt = payload.subarray(saltStart, ivStart);
  const iv = payload.subarray(ivStart, HEADER_LENGTH);
  const ciphertext = payload.subarray(HEADER_LENGTH, payload.length - AUTH_TAG_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function encryptFile(inputPath: string, outputPath: string, passphrase: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv]);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath, { mode: 0o600 });

  try {
    output.write(header);
    await pipeline(input, cipher, output, { end: false });
    const authTag = cipher.getAuthTag();
    await new Promise<void>((resolve, reject) => {
      output.once('error', reject);
      output.end(authTag, () => resolve());
    });
    return outputPath;
  } catch (err) {
    input.destroy();
    output.destroy();
    fs.rmSync(outputPath, { force: true });
    throw new Error(`Failed to encrypt file "${inputPath}"`, { cause: err });
  }
}

export async function decryptFile(inputPath: string, outputPath: string, passphrase: string): Promise<string> {
  const stat = fs.statSync(inputPath);
  if (stat.size < HEADER_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted file is too short or corrupted');
  }

  const fd = fs.openSync(inputPath, 'r');
  const header = Buffer.alloc(HEADER_LENGTH);
  const authTag = Buffer.alloc(AUTH_TAG_LENGTH);
  try {
    fs.readSync(fd, header, 0, HEADER_LENGTH, 0);
    fs.readSync(fd, authTag, 0, AUTH_TAG_LENGTH, stat.size - AUTH_TAG_LENGTH);
  } finally {
    fs.closeSync(fd);
  }

  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Invalid encrypted file header');
  }
  const version = header[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption format version: ${String(version)}`);
  }

  const saltStart = MAGIC.length + 1;
  const ivStart = saltStart + SALT_LENGTH;
  const salt = header.subarray(saltStart, ivStart);
  const iv = header.subarray(ivStart, HEADER_LENGTH);
  const key = deriveKey(passphrase, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });

  const ciphertextLength = stat.size - HEADER_LENGTH - AUTH_TAG_LENGTH;
  const output = fs.createWriteStream(outputPath, { mode: 0o600 });

  try {
    if (ciphertextLength === 0) {
      const finalChunk = decipher.final();
      await new Promise<void>((resolve, reject) => {
        output.once('error', reject);
        output.end(finalChunk, () => resolve());
      });
    } else {
      const input = fs.createReadStream(inputPath, {
        start: HEADER_LENGTH,
        end: stat.size - AUTH_TAG_LENGTH - 1
      });
      await pipeline(input, decipher, output);
    }
    return outputPath;
  } catch (err) {
    output.destroy();
    fs.rmSync(outputPath, { force: true });
    throw new Error(`Failed to decrypt file "${inputPath}"`, { cause: err });
  }
}
