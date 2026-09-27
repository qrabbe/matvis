import type { convexTest } from 'convex-test';

// Never decrypted in these tests, so any well-formed EncryptedSecret shape
// works as a stand-in access/refresh token.
export const TEST_SEALED_SECRET = {
	keyVersion: 1,
	iv: 'aXY=',
	ciphertext: 'Y3Q=',
};

export const actingAs = (
	t: ReturnType< typeof convexTest >,
	subject: string
) => t.withIdentity( { subject } );
