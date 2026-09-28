import { useCallback, useState } from 'react';
import { useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { errMsg } from '@matvis/shared';
import { api, type Id } from '../lib/convex-api';

type SyncResult = FunctionReturnType< typeof api.sync.sync >;

export function useSyncConnection( connectionId: Id< 'connections' > ) {
	const convex = useConvex();
	const [ busy, setBusy ] = useState( false );
	const [ result, setResult ] = useState< SyncResult | null >( null );
	const [ error, setError ] = useState< string | null >( null );

	const sync = useCallback( async () => {
		setBusy( true );
		setError( null );
		try {
			setResult( await convex.action( api.sync.sync, { connectionId } ) );
		} catch ( e ) {
			setError( errMsg( e ) );
		} finally {
			setBusy( false );
		}
	}, [ convex, connectionId ] );

	return {
		busy,
		result,
		error,
		needsReauth: result?.status === 'needs_reauth',
		sync,
	};
}
