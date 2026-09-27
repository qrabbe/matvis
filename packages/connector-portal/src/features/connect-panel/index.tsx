import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Button, Card, Notice, Stack, Text } from '@wordpress/ui';
import { STORES, STORE_LABELS, type StoreSlug } from '@matvis/shared';
import { CopyButton, ErrorNotice, InlineSpinner } from '@matvis/ui';
import type { Id } from '../../lib/convex-api';
import {
	clearConnectionId,
	loadConnectionId,
	saveConnectionId,
} from '../../lib/connection-store';
import { pendingHint } from '../../lib/bankid-copy';
import { useBankIdLink } from '../../hooks/use-bank-id-link';
import { useSyncConnection } from '../../hooks/use-sync-connection';
import { QrCode } from '../../components/qr-code';

const LIVE_STORES: readonly StoreSlug[] = [ 'coop' ];

const PICKER_STORES: readonly StoreSlug[] = [ ...STORES ].sort(
	( a, b ) =>
		Number( ! LIVE_STORES.includes( a ) ) -
		Number( ! LIVE_STORES.includes( b ) )
);

export function ConnectPanel() {
	const [ store, setStore ] = useState< StoreSlug >( 'coop' );
	const [ connectionId, setConnectionId ] = useState< string | null >( () =>
		loadConnectionId()
	);

	const onComplete = useCallback( ( id: string ) => {
		saveConnectionId( id );
		setConnectionId( id );
	}, [] );

	const {
		active,
		qr,
		hint,
		appLink,
		sameDevice,
		error,
		login,
		cancel,
		reset,
	} = useBankIdLink( onComplete );

	const relink = useCallback( () => {
		reset();
		clearConnectionId();
		setConnectionId( null );
	}, [ reset ] );

	let stage: ReactNode;
	if ( connectionId ) {
		stage = (
			<ConnectedView connectionId={ connectionId } onRelink={ relink } />
		);
	} else if ( active ) {
		stage = (
			<LinkInProgressView
				qr={ qr }
				hint={ hint }
				appLink={ appLink }
				sameDevice={ sameDevice }
				onCancel={ cancel }
			/>
		);
	} else {
		stage = (
			<StorePickerView
				store={ store }
				onStore={ setStore }
				onLink={ ( onThisDevice ) => login( store, onThisDevice ) }
			/>
		);
	}

	return (
		<Card.Root>
			<Card.Header>
				<Card.Title>Connect a store</Card.Title>
			</Card.Header>
			<Card.Content>
				<Stack direction="column" gap="md">
					{ error && (
						<ErrorNotice title="Something went wrong">
							{ error }
						</ErrorNotice>
					) }

					{ stage }
				</Stack>
			</Card.Content>
		</Card.Root>
	);
}

function StorePickerView( {
	store,
	onStore,
	onLink,
}: {
	store: StoreSlug;
	onStore: ( s: StoreSlug ) => void;
	onLink: ( sameDevice: boolean ) => void;
} ) {
	return (
		<Stack direction="column" gap="md" align="start">
			<Text variant="body-md">
				Link a grocery account with BankID to sync its receipts. Tokens
				are held server-side — nothing touches this browser.
			</Text>
			<Stack direction="row" gap="sm" wrap="wrap">
				{ PICKER_STORES.map( ( slug ) => {
					const live = LIVE_STORES.includes( slug );
					const selected = slug === store;
					return (
						<Button
							key={ slug }
							variant={ selected ? 'solid' : 'outline' }
							tone={ selected ? 'brand' : 'neutral' }
							disabled={ ! live }
							onClick={ () => onStore( slug ) }
						>
							{ STORE_LABELS[ slug ] }
							{ ! live ? ' (coming soon)' : '' }
						</Button>
					);
				} ) }
			</Stack>
			<Stack direction="column" gap="sm" align="start">
				<Button onClick={ () => onLink( false ) }>
					Log in with BankID on a different device
				</Button>
				<Button
					variant="outline"
					tone="neutral"
					onClick={ () => onLink( true ) }
				>
					Open BankID on this device
				</Button>
			</Stack>
		</Stack>
	);
}

function LinkInProgressView( {
	qr,
	hint,
	appLink,
	sameDevice,
	onCancel,
}: {
	qr: string | null;
	hint: string | null;
	appLink: string | null;
	sameDevice: boolean;
	onCancel: () => void;
} ) {
	let content: ReactNode;
	if ( sameDevice ) {
		content = appLink ? (
			<>
				<Text variant="body-md">Opening the BankID app…</Text>
				<Button
					variant="solid"
					tone="brand"
					// eslint-disable-next-line jsx-a11y/anchor-has-content -- Button merges its children into this anchor via the render prop
					render={ <a href={ appLink } referrerPolicy="origin" /> }
				>
					Didn’t open? Tap to open BankID
				</Button>
			</>
		) : (
			<InlineSpinner label="Starting BankID…" variant="body-md" />
		);
	} else if ( qr ) {
		content = (
			<>
				<QrCode value={ qr } />
				<Text variant="body-sm">{ hint ?? pendingHint }</Text>
			</>
		);
	} else {
		content = <InlineSpinner label="Starting BankID…" variant="body-md" />;
	}

	return (
		<Stack direction="column" gap="md" align="center">
			{ content }
			<Button variant="minimal" tone="neutral" onClick={ onCancel }>
				Cancel
			</Button>
		</Stack>
	);
}

function ConnectedView( {
	connectionId,
	onRelink,
}: {
	connectionId: string;
	onRelink: () => void;
} ) {
	const { busy, result, error, needsReauth, sync } = useSyncConnection(
		connectionId as Id< 'connections' >
	);

	return (
		<Stack direction="column" gap="md">
			<Stack direction="row" gap="sm" align="center" wrap="wrap">
				<Badge intent="stable">Connected</Badge>
				<Text variant="body-sm">Connection { connectionId }</Text>
				<CopyButton text={ connectionId } label="Copy id" />
			</Stack>

			{ needsReauth && (
				<Notice.Root intent="warning">
					<Notice.Title>Re-link needed</Notice.Title>
					<Notice.Description>
						The stored BankID session expired. Link the store again
						to keep syncing.
					</Notice.Description>
				</Notice.Root>
			) }

			{ error && (
				<ErrorNotice title="Sync failed">{ error }</ErrorNotice>
			) }

			{ result && ! needsReauth && (
				<Text variant="body-sm">
					Synced { result.synced } new · skipped { result.skipped } ·
					status { result.status }
				</Text>
			) }

			<Stack direction="row" gap="sm" wrap="wrap">
				<Button onClick={ sync } loading={ busy }>
					Sync now
				</Button>
				<Button variant="outline" tone="neutral" onClick={ onRelink }>
					Re-link
				</Button>
			</Stack>
		</Stack>
	);
}
