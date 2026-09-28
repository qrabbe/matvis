import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const store = vi.hoisted( () => ( { setTargetCalls: [] as unknown[] } ) );

const MOCK_TOKEN = 'mv_' + 'abcdef123456';

vi.mock( '../../src/hooks/use-settings', () => ( {
	useSettings: () => ( {
		available: true,
		targets: [
			{ key: 'salt', label: 'Salt', unit: 'g', enabled: true, value: 6 },
		],
		setTarget: async ( key: string, next: unknown ) => {
			store.setTargetCalls.push( [ key, next ] );
		},
		error: null,
	} ),
} ) );

vi.mock( 'convex/react', () => ( {
	useQuery: () => [],
} ) );

const { SettingsTab } = await import( '../../src/features/settings-tab' );

beforeEach( () => {
	store.setTargetCalls = [];
} );

describe( 'SettingsTab', () => {
	it( 'shows a masked token and a Forget action', () => {
		const onForget = vi.fn();
		render(
			<SettingsTab token={ MOCK_TOKEN } onForgetToken={ onForget } />
		);
		expect( screen.getByText( '…123456' ) ).toBeInTheDocument();
	} );

	it( 'calling Forget invokes the callback', async () => {
		const user = userEvent.setup();
		const onForget = vi.fn();
		render(
			<SettingsTab token={ MOCK_TOKEN } onForgetToken={ onForget } />
		);
		await user.click( screen.getByRole( 'button', { name: 'Forget' } ) );
		expect( onForget ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'toggling an enabled target off calls setTarget with null', async () => {
		const user = userEvent.setup();
		render(
			<SettingsTab token={ MOCK_TOKEN } onForgetToken={ () => {} } />
		);
		await user.click( screen.getByRole( 'switch' ) );
		expect( store.setTargetCalls ).toEqual( [ [ 'salt', null ] ] );
	} );

	it( 'tapping a target value lets you type a custom number', async () => {
		const user = userEvent.setup();
		render(
			<SettingsTab token={ MOCK_TOKEN } onForgetToken={ () => {} } />
		);
		await user.click( screen.getByText( '6 g' ) );
		const input = screen.getByDisplayValue( '6' );
		await user.clear( input );
		await user.type( input, '8{Enter}' );
		expect( store.setTargetCalls ).toEqual( [ [ 'salt', 8 ] ] );
	} );
} );
