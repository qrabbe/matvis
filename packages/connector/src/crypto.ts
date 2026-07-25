// Encryption for the store credentials we must keep usable (Coop/BankID access
// and refresh tokens). Hashing is not an option since we replay the tokens
// against the store API, so we store AES-256-GCM ciphertext and decrypt it
// transiently inside the sync action. Plaintext never sits at rest.
//
// Built on WebCrypto only, so the exact same code runs in the Convex isolate,
// the "use node" action runtime, and the test runners.

/** A secret at rest: base64 AES-256-GCM output plus the nonce that produced it. */
export interface EncryptedSecret {
  /** Which key encrypted this, so a future key rotation can tell them apart. */
  keyVersion: number;
  /** Base64 of the 12 random bytes used as the GCM nonce. */
  iv: string;
  /** Base64 of the GCM output, which carries the 16 byte auth tag at its end. */
  ciphertext: string;
}

/** The key version every new ciphertext is written with. */
export const TOKEN_KEY_VERSION = 1;

/** Name of the Convex environment variable holding the base64 encryption key. */
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

/**
 * Import a base64 encoded 32 byte secret as an AES-GCM key. Throws when the
 * material is not valid base64 or is not exactly 32 bytes long.
 */
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

/** Mint a fresh base64 encoded 32 byte key, ready for `TOKEN_ENC_KEY`. */
export function generateTokenKey(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

/** Encrypt a secret under a fresh random nonce. Never reuses an IV. */
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

/**
 * Decrypt a secret written by {@link encryptSecret}. Throws on an unknown key
 * version and on a failed authentication tag (tampered or wrong key).
 */
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

/**
 * The deployment's token key, read once from `TOKEN_ENC_KEY` and cached for the
 * lifetime of the isolate. Throws when the variable is unset.
 */
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

/** Encrypt a token pair for storage, under the deployment's token key. */
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

/** Decrypt a stored token pair back into the plaintext the store API expects. */
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
