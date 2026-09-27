import { useState } from 'react';
import { useMutation } from 'convex/react';
import { Button, Card, InputControl, Stack } from '@wordpress/ui';
import { STORE_LABELS } from '@matvis/shared';
import { DEFAULT_RUN_BATCHES, type IngestLane } from '@matvis/catalog';
import { adminApi } from '../../lib/admin-api';
import { TaskResult, useAdminTask } from './task';

export function RunControls( {
	token,
	store,
	paused,
}: {
	token: string;
	store: IngestLane;
	paused: boolean;
} ) {
	const startRun = useMutation( adminApi.admin.startRun );
	const setPaused = useMutation( adminApi.admin.setPaused );

	const [ batches, setBatches ] = useState( String( DEFAULT_RUN_BATCHES ) );
	const { state, run } = useAdminTask();

	return (
		<Card.Root>
			<Card.Header>
				<Card.Title>Run</Card.Title>
			</Card.Header>
			<Card.Content>
				<Stack direction="column" gap="lg">
					<Stack direction="row" gap="md" align="end" wrap="wrap">
						<div style={ { flex: '0 1 140px' } }>
							<InputControl
								label="Batches"
								type="number"
								value={ batches }
								onValueChange={ ( value ) =>
									setBatches( value )
								}
							/>
						</div>
						<Button
							onClick={ () =>
								run( async () => {
									const result = await startRun( {
										token,
										store,
										batches: Number( batches ),
									} );
									return `${ STORE_LABELS[ store ] } run scheduled for ${ result.batches } batch(es).`;
								} )
							}
						>
							{ `Run ${ STORE_LABELS[ store ] }` }
						</Button>
					</Stack>

					<Stack direction="column" gap="sm">
						<Stack
							direction="row"
							gap="md"
							align="center"
							wrap="wrap"
						>
							<Button
								tone={ paused ? 'brand' : 'neutral' }
								variant={ paused ? 'solid' : 'outline' }
								onClick={ () =>
									run( async () => {
										await setPaused( {
											token,
											paused: ! paused,
										} );
										return paused
											? 'Ingest resumed.'
											: 'Ingest paused.';
									} )
								}
							>
								{ paused ? 'Resume ingest' : 'Pause ingest' }
							</Button>
						</Stack>
					</Stack>

					<TaskResult state={ state } busyLabel="Scheduling…" />
				</Stack>
			</Card.Content>
		</Card.Root>
	);
}
