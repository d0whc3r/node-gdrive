import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptBuffer, decryptFile, encryptBuffer, encryptFile } from '../src/crypto';

describe('AES-256-GCM crypto helpers', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gdrive-crypto-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips buffer encryption and decryption', () => {
    const plaintext = Buffer.from('Hello, encrypted Google Drive backup!', 'utf8');
    const encrypted = encryptBuffer(plaintext, 'super-secret-key');

    expect(encrypted.equals(plaintext)).toBe(false);
    expect(encrypted.subarray(0, 4).toString('ascii')).toBe('NGDE');

    const decrypted = decryptBuffer(encrypted, 'super-secret-key');
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('fails buffer decryption with wrong key or tampered payload', () => {
    const encrypted = encryptBuffer(Buffer.from('sensitive'), 'correct-key');

    expect(() => decryptBuffer(encrypted, 'wrong-key')).toThrow();

    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptBuffer(tampered, 'correct-key')).toThrow();
  });

  it('rejects empty passphrase and invalid headers', () => {
    expect(() => encryptBuffer(Buffer.from('abc'), '')).toThrow('passphrase');
    expect(() => decryptBuffer(Buffer.from('short'), 'key')).toThrow('too short');

    const badMagic = Buffer.alloc(64, 0x41);
    expect(() => decryptBuffer(badMagic, 'key')).toThrow('Invalid encrypted file header');

    const badVersion = Buffer.concat([Buffer.from('NGDE', 'ascii'), Buffer.from([99]), Buffer.alloc(60)]);
    expect(() => decryptBuffer(badVersion, 'key')).toThrow('Unsupported encryption format version');
  });

  it('round-trips file encryption and decryption (including 0-byte files)', async () => {
    const inputPath = path.join(tmpDir, 'plain.txt');
    const encryptedPath = path.join(tmpDir, 'plain.txt.enc');
    const decryptedPath = path.join(tmpDir, 'plain.decrypted.txt');
    const payload = 'Line 1\nLine 2\n'.repeat(1000);
    fs.writeFileSync(inputPath, payload, 'utf8');

    await encryptFile(inputPath, encryptedPath, 'file-secret');
    const mode = fs.statSync(encryptedPath).mode & 0o777;
    expect(mode).toBe(0o600);

    await decryptFile(encryptedPath, decryptedPath, 'file-secret');
    expect(fs.readFileSync(decryptedPath, 'utf8')).toBe(payload);

    // 0-byte file
    const emptyInput = path.join(tmpDir, 'empty.txt');
    const emptyEnc = path.join(tmpDir, 'empty.txt.enc');
    const emptyDec = path.join(tmpDir, 'empty.dec.txt');
    fs.writeFileSync(emptyInput, '');
    await encryptFile(emptyInput, emptyEnc, 'file-secret');
    await decryptFile(emptyEnc, emptyDec, 'file-secret');
    expect(fs.statSync(emptyDec).size).toBe(0);
  });

  it('cleans up destination file on failed file decryption with wrong key', async () => {
    const inputPath = path.join(tmpDir, 'secret.txt');
    const encryptedPath = path.join(tmpDir, 'secret.txt.enc');
    const decryptedPath = path.join(tmpDir, 'secret.wrong.txt');
    fs.writeFileSync(inputPath, 'top secret data', 'utf8');

    await encryptFile(inputPath, encryptedPath, 'right-key');
    await expect(decryptFile(encryptedPath, decryptedPath, 'wrong-key')).rejects.toThrow('Failed to decrypt');
    expect(fs.existsSync(decryptedPath)).toBe(false);
  });
});
