import { useState } from 'react';
import {
	Tabs,
	Text,
	Card,
	InputControl,
	Link,
	Stack,
	Button,
} from '@wordpress/ui';
import { ErrorNotice, InlineSpinner } from '@matvis/ui';
import { usePurchaseData } from './hooks/use-purchase-data';
import { PantryTab } from './features/pantry-tab';
import { PurchasesTab } from './features/purchases-tab';
import { InsightsTab } from './features/insights-tab';
import { SettingsTab } from './features/settings-tab';
import { IdentifyQueueScreen } from './features/identify-queue-screen';
import { IdentifyScreen } from './features/identify-screen';
import { looksLikeToken, useApiToken } from './lib/token-store';

type IdentifyRoute = { screen: 'queue' } | { screen: 'text'; text: string };

const appColumnStyle: React.CSSProperties = {
	position: 'relative',
	maxWidth: '480px',
	margin: '0 auto',
	display: 'flex',
	flexDirection: 'column',
	height: '100dvh',
};

export function App() {
	const { token, setToken, forgetToken } = useApiToken();
	const data = usePurchaseData( token );
	const [ activeTab, setActiveTab ] = useState( 'pantry' );
	const [ identify, setIdentify ] = useState< IdentifyRoute | null >( null );

	if ( token && identify ) {
		return (
			<div style={ appColumnStyle }>
				{ identify.screen === 'queue' ? (
					<IdentifyQueueScreen
						lines={ data.lines }
						onSelectText={ ( text ) =>
							setIdentify( { screen: 'text', text } )
						}
						onClose={ () => setIdentify( null ) }
					/>
				) : (
					<IdentifyScreen
						lines={ data.lines }
						selectedText={ identify.text }
						token={ token }
						onBackToQueue={ () =>
							setIdentify( { screen: 'queue' } )
						}
					/>
				) }
			</div>
		);
	}

	return (
		<div style={ appColumnStyle }>
			{ ! token ? (
				<TokenGate onSubmit={ setToken } />
			) : (
				<>
					{ data.error && (
						<ErrorNotice title="Something did not load">
							{ data.error }
						</ErrorNotice>
					) }
					{ ( data.hydration.total > data.hydration.done ||
						data.loadingHeaders ) && (
						<InlineSpinner label="Loading receipts" />
					) }

					<Tabs.Root
						value={ activeTab }
						onValueChange={ setActiveTab }
						style={ {
							flex: 1,
							display: 'flex',
							flexDirection: 'column',
							minHeight: 0,
						} }
					>
						<div
							style={ {
								flex: 1,
								overflowY: 'auto',
								minHeight: 0,
							} }
						>
							<Tabs.Panel value="pantry">
								<PantryTab
									lines={ data.lines }
									token={ token }
									onOpenIdentify={ () =>
										setIdentify( { screen: 'queue' } )
									}
								/>
							</Tabs.Panel>
							<Tabs.Panel value="insights">
								<InsightsTab data={ data } token={ token } />
							</Tabs.Panel>
							<Tabs.Panel value="purchases">
								<PurchasesTab
									data={ data }
									token={ token }
									onOpenIdentify={ () =>
										setIdentify( { screen: 'queue' } )
									}
								/>
							</Tabs.Panel>
							<Tabs.Panel value="settings">
								<SettingsTab
									token={ token }
									onForgetToken={ forgetToken }
								/>
							</Tabs.Panel>
						</div>

						<Tabs.List
							variant="minimal"
							style={ {
								display: 'grid',
								gridTemplateColumns: 'repeat(4, 1fr)',
								width: '100%',
								borderTop:
									'1px solid var(--wpds-color-stroke-surface-neutral)',
								marginTop: 'auto',
							} }
						>
							{ (
								[
									[ 'pantry', 'Pantry' ],
									[ 'insights', 'Insights' ],
									[ 'purchases', 'Purchases' ],
									[ 'settings', 'Settings' ],
								] as const
							 ).map( ( [ value, label ] ) => (
								<Tabs.Tab
									key={ value }
									value={ value }
									style={ {
										padding: '10px 2px 13px',
										textAlign: 'center',
										fontSize: '11px',
										fontWeight:
											activeTab === value ? 700 : 500,
										color:
											activeTab === value
												? 'var(--wpds-color-foreground-interactive-brand)'
												: 'var(--wpds-color-foreground-content-neutral-weak)',
									} }
								>
									{ label }
								</Tabs.Tab>
							) ) }
						</Tabs.List>
					</Tabs.Root>
				</>
			) }
		</div>
	);
}

function TokenGate( { onSubmit }: { onSubmit: ( token: string ) => void } ) {
	const [ value, setValue ] = useState( '' );

	return (
		<div style={ { padding: '48px 20px' } }>
			<Card.Root>
				<Card.Header>
					<Card.Title>Connect your receipts</Card.Title>
				</Card.Header>
				<Card.Content>
					<Stack direction="column" gap="md">
						<Text variant="body-md">
							Paste your account API token. Mint one in the{ ' ' }
							<Link href="../connector/">connector portal</Link>{ ' ' }
							under Connect - that is also where you link a store.
						</Text>
						<InputControl
							label="Account API token"
							description="Stored in this browser only. It grants read access to one account's receipts."
							value={ value }
							onValueChange={ setValue }
						/>
						<Stack direction="row" gap="sm">
							<Button
								disabled={ ! looksLikeToken( value ) }
								onClick={ () => onSubmit( value ) }
							>
								Use this token
							</Button>
						</Stack>
						<Text variant="body-sm">
							The app can only read. It never opens an auth
							session, so linking, syncing and every other write
							stay with the portal.
						</Text>
					</Stack>
				</Card.Content>
			</Card.Root>
		</div>
	);
}
