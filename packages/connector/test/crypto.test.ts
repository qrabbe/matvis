import { describe, expect, it } from 'bun:test';
import {
  decryptSecret,
  encryptSecret,
  type EncryptedSecret,
  generateTokenKey,
  importTokenKey,
  TOKEN_KEY_VERSION,
} from '../src/crypto';

const key = await importTokenKey(generateTokenKey());

describe('token encryption', () => {
  it('round-trips a secret', async () => {
    const sealed = await encryptSecret('bankid-access-token', key);
    expect(await decryptSecret(sealed, key)).toBe('bankid-access-token');
  });

  it('round-trips non-ASCII text', async () => {
    const sealed = await encryptSecret('räksmörgås-ÅÄÖ-🔐', key);
    expect(await decryptSecret(sealed, key)).toBe('räksmörgås-ÅÄÖ-🔐');
  });

  it('never stores the plaintext and stamps the key version', async () => {
    const sealed = await encryptSecret('bankid-access-token', key);
    expect(sealed.keyVersion).toBe(TOKEN_KEY_VERSION);
    expect(sealed.ciphertext).not.toContain('bankid');
    expect(atob(sealed.ciphertext)).not.toContain('bankid');
  });

  it('uses a fresh nonce per call, so equal plaintexts differ', async () => {
    const a = await encryptSecret('same', key);
    const b = await encryptSecret('same', key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('fails to decrypt under a different key', async () => {
    const sealed = await encryptSecret('secret', key);
    const other = await importTokenKey(generateTokenKey());
    expect(decryptSecret(sealed, other)).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext', async () => {
    const sealed = await encryptSecret('secret', key);
    const bytes = atob(sealed.ciphertext).split('');
    bytes[0] = String.fromCharCode(bytes[0]!.charCodeAt(0) ^ 0xff);
    const tampered: EncryptedSecret = {
      ...sealed,
      ciphertext: btoa(bytes.join('')),
    };
    expect(decryptSecret(tampered, key)).rejects.toThrow();
  });

  it('refuses an unknown key version', async () => {
    const sealed = await encryptSecret('secret', key);
    expect(decryptSecret({ ...sealed, keyVersion: 99 }, key)).rejects.toThrow(
      'key version 99',
    );
  });

  it('rejects key material of the wrong length', async () => {
    expect(importTokenKey(btoa('too-short'))).rejects.toThrow('32 bytes');
  });
});
