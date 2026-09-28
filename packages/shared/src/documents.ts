import type { GenericId } from 'convex/values';
import type { ReceiptCore } from './receipt';
import type { CatalogItem } from './catalog';
import type { StoreSlug } from './stores';

export type ReceiptHeader = ReceiptCore & {
	_id: GenericId< 'receipts' >;
	_creationTime: number;
	connectionId: GenericId< 'connections' >;
	accountId: GenericId< 'accounts' >;
	externalId: string;
	purchasedAtMs?: number;
	pdfStorageId?: GenericId< '_storage' >;
};

/**
 * How a receipt line's printed text resolved against `itemGtinMap`, live at
 * read time. `product` is the only kind that carries a `gtin`. Absent means
 * the text has no mapping row yet, unidentified rather than any of these kinds.
 */
export type ItemMappingKind =
	'product' | 'produce' | 'notFood' | 'notInCatalog';

export type ReceiptItemDoc = {
	_id: GenericId< 'receiptItems' >;
	_creationTime: number;
	receiptId: GenericId< 'receipts' >;
	lineNo: number;
	text: string;
	price: number;
	isDiscount: boolean;
	quantity?: number;
	unit?: string;
	gtin?: string;
	kind?: ItemMappingKind;
};

export type ConnectionPublic = {
	_id: GenericId< 'connections' >;
	_creationTime: number;
	store: StoreSlug;
	status: 'active' | 'needs_reauth' | 'revoked';
	accessTokenExpiresAt: number;
	refreshTokenExpiresAt?: number;
	lastSyncedAt?: number;
};

export type CatalogRow = CatalogItem & {
	_id: GenericId< 'catalog' >;
	_creationTime: number;
};
