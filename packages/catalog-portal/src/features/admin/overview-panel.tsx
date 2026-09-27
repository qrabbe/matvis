import { useAction, useQuery } from 'convex/react';
import { Badge, Button, Card, Stack, Text } from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { STORE_LABELS } from '@matvis/shared';
import { type IngestLane } from '@matvis/catalog';
import { adminApi, type Overview } from '../../lib/admin-api';
import { api } from '../../lib/convex-api';
import { formatCount } from './format';
import { TaskResult, useAdminTask } from './task';

export function OverviewPanel( {
	overview,
	token,
	store,
}: {
	overview: Overview;
	token: string;
	/**
	 * Only the fill sweep is per lane. Every other number on this panel is
	 * whole-table, which the copy below has to keep saying out loud.
	 */
	store: IngestLane;
} ) {
	const { queue, fill, freshness } = overview;
	// The per-store breakdown is the same public query the site header reads,
	// rather than a second copy of the same counters behind the session gate.
	const health = useQuery( api.catalog.health, {} );
	const rebuildCounters = useAction( adminApi.admin.rebuildCounters );
	const rebuildCategoryTree = useAction( adminApi.admin.rebuildCategoryTree );
	const { state, run } = useAdminTask();
	const categoryTreeTask = useAdminTask();

	return (
		<Card.Root>
			<Card.Header>
				<Card.Title>
					<Stack direction="row" gap="sm" align="center">
						<span>Overview</span>
						{ overview.paused && (
							<Badge intent="high">paused</Badge>
						) }
					</Stack>
				</Card.Title>
			</Card.Header>
			<Card.Content>
				<Stack direction="column" gap="lg">
					<Stat
						label="Catalog"
						value={ overview.catalogTotal.toLocaleString() }
						note="clean rows across every store"
					/>

					<Stack direction="column" gap="sm">
						{ health === undefined ? (
							<SkeletonList
								label="Loading store counts…"
								rows={ 2 }
							/>
						) : (
							<Stack direction="row" gap="xl" wrap="wrap">
								{ [ ...health.stores ]
									.sort( ( a, b ) => b.count - a.count )
									.map( ( row ) => (
										<Stat
											key={ row.store }
											label={ STORE_LABELS[ row.store ] }
											value={ formatCount( row.count ) }
										/>
									) ) }
							</Stack>
						) }
					</Stack>
					<Stack direction="row" gap="xl" wrap="wrap">
						<Stat
							label="Pending"
							value={ formatCount( queue.pending ) }
							note="all lanes"
						/>
						<Stat
							label="Processing"
							value={ formatCount( queue.processing ) }
							note="all lanes"
						/>
						<Stat
							label="Skipped"
							value={ formatCount( queue.skipped ) }
							note="all lanes"
						/>
					</Stack>

					<Stack direction="row" gap="xl" wrap="wrap">
						<Stat
							label={ `${ STORE_LABELS[ store ] } EANs known` }
							value={ formatCount( fill.eansKnown ) }
						/>
						<Stat
							label="Fill sweep"
							value={
								fill.cursorAtEnd
									? 'at the start of a fresh pass'
									: 'mid pass'
							}
						/>
					</Stack>

					<Stack direction="row" gap="xl" wrap="wrap">
						<Stat
							label="Verified"
							value={ formatCount( freshness.verified ) }
							note="carrying a fetch timestamp"
						/>
						<Stat
							label="Never fetched"
							value={ formatCount( freshness.never ) }
						/>
					</Stack>
					<Stack direction="row" gap="xl" wrap="wrap">
						<Stat
							label="Added past week"
							value={ formatCount( freshness.sample.week ) }
						/>
						<Stat
							label="Past month"
							value={ formatCount( freshness.sample.month ) }
						/>
						<Stat
							label="Older"
							value={ formatCount( freshness.sample.older ) }
						/>
						<Stat
							label="Never"
							value={ formatCount( freshness.sample.never ) }
						/>
					</Stack>

					<Stack direction="row" gap="md" align="center" wrap="wrap">
						<Button
							variant="outline"
							tone="neutral"
							onClick={ () =>
								run( async () => {
									const result = await rebuildCounters( {
										token,
									} );
									return `Recounted ${ result.pages } page(s): ${ result.catalog?.total ?? 0 } catalog row(s), ${ result.catalog?.eans ?? 0 } EAN(s).`;
								} )
							}
						>
							Rebuild counters
						</Button>
						<Button
							variant="outline"
							tone="neutral"
							onClick={ () =>
								categoryTreeTask.run( async () => {
									const result = await rebuildCategoryTree( {
										token,
									} );
									return `Rebuilt ${ result.rows } category row(s) across ${ result.pages } page(s).`;
								} )
							}
						>
							Rebuild category tree
						</Button>
					</Stack>
					<Text variant="body-sm">
						Both need ingest paused first.
					</Text>
					<TaskResult state={ state } busyLabel="Recounting…" />
					<TaskResult
						state={ categoryTreeTask.state }
						busyLabel="Rebuilding…"
					/>
				</Stack>
			</Card.Content>
		</Card.Root>
	);
}

function Stat( {
	label,
	value,
	note,
}: {
	label: string;
	value: string;
	note?: string;
} ) {
	return (
		<Stack direction="column" gap="xs" style={ { minWidth: 120 } }>
			<Text variant="body-sm">{ label }</Text>
			<Text variant="heading-md">{ value }</Text>
			{ note && <Text variant="body-sm">{ note }</Text> }
		</Stack>
	);
}
