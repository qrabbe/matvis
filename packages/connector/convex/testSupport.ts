import type { DataModelFromSchemaDefinition } from 'convex/server';
import type {
	TestConvexForDataModel,
	TestConvexForDataModelAndIdentity,
} from 'convex-test';
import schema from './schema';

type DataModel = DataModelFromSchemaDefinition< typeof schema >;

// `ReturnType<typeof convexTest>` (used all over the *.vitest.ts files) can't
// resolve `typeof convexTest`'s generic schema parameter on its own, so it
// silently widens to a generic, table-less data model — `t.query(...)` and
// `ctx.db.query('table').withIndex(...)` then fail to typecheck against real
// tables and indexes. Binding the schema explicitly here is what fixes that.
export type Test = TestConvexForDataModel< DataModel >;

// Never decrypted in these tests, so any well-formed EncryptedSecret shape
// works as a stand-in access/refresh token.
export const TEST_SEALED_SECRET = {
	keyVersion: 1,
	iv: 'aXY=',
	ciphertext: 'Y3Q=',
};

export const actingAs = (
	t: TestConvexForDataModelAndIdentity< DataModel >,
	subject: string
) => t.withIdentity( { subject } );
