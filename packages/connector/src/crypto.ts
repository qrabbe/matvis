// Hashing is not an option: the tokens are replayed against the store API. They
// are decrypted transiently inside the sync action and never sit at rest.
export interface EncryptedSecret {
  keyVersion: number;
  iv: string;
  ciphertext: string;
}

export const TOKEN_KEY_VERSION = 1;

export const TOKEN_KEY_ENV_VAR = 'TOKEN_ENC_KEY';

const IV_BYTES = 12;
const KEY_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function importTokenKey(base64Key: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = fromBase64(base64Key.trim());
  } catch {
    throw new Error(`${TOKEN_KEY_ENV_VAR} is not valid base64`);
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `${TOKEN_KEY_ENV_VAR} must decode to ${KEY_BYTES} bytes, got ${raw.length}`,
    );
  }
  return await crypto.subtle.importKey(
    'raw',
    raw as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function generateTokenKey(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

export async function encryptSecret(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    keyVersion: TOKEN_KEY_VERSION,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(sealed)),
  };
}

export async function decryptSecret(
  secret: EncryptedSecret,
  key: CryptoKey,
): Promise<string> {
  if (secret.keyVersion !== TOKEN_KEY_VERSION) {
    throw new Error(
      `cannot decrypt secret written with key version ${secret.keyVersion}`,
    );
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(secret.iv) as unknown as ArrayBuffer },
    key,
    fromBase64(secret.ciphertext) as unknown as ArrayBuffer,
  );
  return new TextDecoder().decode(plain);
}

let cachedKey: Promise<CryptoKey> | undefined;

export function tokenEncryptionKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    const material = process.env[TOKEN_KEY_ENV_VAR];
    if (!material) {
      return Promise.reject(
        new Error(
          `${TOKEN_KEY_ENV_VAR} is not set. Run \`node scripts/generate-token-key.mjs\` from packages/connector to mint one.`,
        ),
      );
    }
    cachedKey = importTokenKey(material);
  }
  return cachedKey;
}

export async function encryptTokenPair(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<{
  accessToken: EncryptedSecret;
  refreshToken: EncryptedSecret;
}> {
  const key = await tokenEncryptionKey();
  const [accessToken, refreshToken] = await Promise.all([
    encryptSecret(tokens.accessToken, key),
    encryptSecret(tokens.refreshToken, key),
  ]);
  return { accessToken, refreshToken };
}

export async function decryptTokenPair(tokens: {
  accessToken: EncryptedSecret;
  refreshToken: EncryptedSecret;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const key = await tokenEncryptionKey();
  const [accessToken, refreshToken] = await Promise.all([
    decryptSecret(tokens.accessToken, key),
    decryptSecret(tokens.refreshToken, key),
  ]);
  return { accessToken, refreshToken };
}
