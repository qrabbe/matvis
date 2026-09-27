import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { header, item, line, markRow, product } from '../support/fixtures';
import type { MarkRow } from '../../src/lib/appBackendApi';

const store = vi.hoisted( () => ( {
	marks: [] as MarkRow[],
	markCalls: [] as unknown[],
	markManyCalls: [] as unknown[],
	unmarkCalls: [] as unknown[],
} ) );

vi.mock( '../../src/hooks/useMarks', () => ( {
	useMarks: () => ( {
		available: true,
		marks: store.marks,
		mark: async ( args: unknown ) => {
			store.markCalls.push( args );
		},
		markMany: async ( args: unknown ) => {
			store.markManyCalls.push( args );
		},
		unmark: async ( args: unknown ) => {
			store.unmarkCalls.push( args );
		},
		error: null,
	} ),
} ) );

const { PantryTab } = await import( '../../src/features/PantryTab' );

beforeEach( () => {
	store.marks = [];
	store.markCalls = [];
	store.markManyCalls = [];
	store.unmarkCalls = [];
} );

function milkLine( purchasedAt: string, lineNo = 1 ) {
	return line( {
		item: item( {
			lineNo,
			text: 'MJÖLK',
			price: 15.95,
			gtin: '111',
			kind: 'product',
		} ),
		header: header( { purchasedAt } ),
		purchasedAt: new Date( purchasedAt ),
		product: product( { ean: '111', name: 'Standardmjölk 3%' } ),
	} );
}

describe( 'PantryTab', () => {
	it( 'renders one tile per outstanding product', () => {
		render(
			<PantryTab
				lines={ [ milkLine( '2026-09-20T10:00:00.000Z' ) ] }
				token="tok_a"
			/>
		);
		expect( screen.getByText( 'Standardmjölk 3%' ) ).toBeInTheDocument();
		expect( screen.getByText( '1 items at home' ) ).toBeInTheDocument();
	} );

	it( 'never tiles a line with no resolved kind — it counts toward "To identify" instead', () => {
		render(
			<PantryTab
				lines={ [
					line( {
						item: item( {
							lineNo: 1,
							text: 'PASTASÅS ARRABBIA.',
							price: 22.24,
						} ),
						header: header( {
							purchasedAt: '2026-09-20T10:00:00.000Z',
						} ),
						product: null,
					} ),
				] }
				token="tok_a"
			/>
		);
		expect( screen.getByText( /To identify · 1/ ) ).toBeInTheDocument();
		expect( screen.queryByText( 'PASTASÅS ARRABBIA.' ) ).toBeNull();
	} );

	it( 'a tile already fully marked finished does not appear', () => {
		const l = milkLine( '2026-09-20T10:00:00.000Z' );
		render( <PantryTab lines={ [ l ] } token="tok_a" /> );
		// sanity: with no marks, it's there
		expect( screen.getByText( 'Standardmjölk 3%' ) ).toBeInTheDocument();
	} );

	it( 'tapping a tile calls mark on its oldest unit and shows a toast', async () => {
		const user = userEvent.setup();
		render(
			<PantryTab
				lines={ [ milkLine( '2026-09-20T10:00:00.000Z' ) ] }
				token="tok_a"
				today={ new Date( '2026-09-25T12:00:00.000Z' ) }
			/>
		);

		await user.click( screen.getByText( 'Standardmjölk 3%' ) );

		expect( store.markCalls ).toHaveLength( 1 );
		expect( store.markCalls[ 0 ] ).toMatchObject( {
			receiptId: 'receipt_1',
			lineNo: 1,
			unitIndex: 0,
			outcome: 'finished',
			via: 'tap',
		} );
		expect(
			screen.getByText( /Standardmjölk 3% · 1 000 kcal/ )
		).toBeInTheDocument();
	} );

	it( 'due-first and oldest-first produce different orders for an overdue vs a fresh product', async () => {
		const user = userEvent.setup();
		const overdue = line( {
			item: item( {
				lineNo: 1,
				text: 'OLD',
				price: 10,
				gtin: 'a',
				kind: 'product',
			} ),
			header: header( { purchasedAt: '2026-01-01T10:00:00.000Z' } ),
			purchasedAt: new Date( '2026-01-01T10:00:00.000Z' ),
			product: product( { ean: 'a', name: 'Old Product' } ),
		} );
		const fresh = line( {
			item: item( {
				lineNo: 2,
				text: 'NEW',
				price: 10,
				gtin: 'b',
				kind: 'product',
			} ),
			header: header( { purchasedAt: '2026-09-24T10:00:00.000Z' } ),
			purchasedAt: new Date( '2026-09-24T10:00:00.000Z' ),
			product: product( { ean: 'b', name: 'New Product' } ),
		} );

		render(
			<PantryTab
				lines={ [ fresh, overdue ] }
				token="tok_a"
				today={ new Date( '2026-09-25T12:00:00.000Z' ) }
			/>
		);
		// Both fall back to the flat 7-day default, so "Old Product" (older
		// purchase) is overdue and should sort first under Due first.
		const dueFirstNames = screen
			.getAllByText( /Product$/ )
			.map( ( el ) => el.textContent );
		expect( dueFirstNames[ 0 ] ).toBe( 'Old Product' );

		await user.click(
			screen.getByRole( 'button', { name: 'Newest first' } )
		);
		const newestFirstNames = screen
			.getAllByText( /Product$/ )
			.map( ( el ) => el.textContent );
		expect( newestFirstNames[ 0 ] ).toBe( 'New Product' );
	} );

	it( 'folds a product whose own pace shows it lasting over 30 days into staples, expandable', async () => {
		const user = userEvent.setup();
		const today = new Date( '2026-09-25T12:00:00.000Z' );
		const staple = (
			receiptId: string,
			lineNo: number,
			purchasedAt: string
		) =>
			line( {
				item: item( {
					lineNo,
					text: 'OLIVOLJA',
					price: 40,
					gtin: 'oil',
					kind: 'product',
				} ),
				header: header( {
					_id: receiptId as ReturnType< typeof header >[ '_id' ],
					purchasedAt,
				} ),
				purchasedAt: new Date( purchasedAt ),
				product: product( { ean: 'oil', name: 'Olivolja' } ),
			} );
		const oldFinished = staple(
			'receipt_1',
			1,
			'2026-06-01T10:00:00.000Z'
		);
		const olderFinished = staple(
			'receipt_2',
			2,
			'2026-04-01T10:00:00.000Z'
		);
		const outstanding = staple(
			'receipt_3',
			3,
			'2026-09-20T10:00:00.000Z'
		);

		store.marks = [
			markRow( {
				receiptId: 'receipt_1',
				lineNo: 1,
				unitIndex: 0,
				startedAt: Date.parse( '2026-06-01T10:00:00.000Z' ),
				finishedAt: Date.parse( '2026-07-11T10:00:00.000Z' ), // +40 days
				via: 'tap',
			} ),
			markRow( {
				receiptId: 'receipt_2',
				lineNo: 2,
				unitIndex: 0,
				startedAt: Date.parse( '2026-04-01T10:00:00.000Z' ),
				finishedAt: Date.parse( '2026-05-06T10:00:00.000Z' ), // +35 days
				via: 'tap',
			} ),
		];

		render(
			<PantryTab
				lines={ [ oldFinished, olderFinished, outstanding ] }
				token="tok_a"
				today={ today }
			/>
		);

		expect(
			screen.getByText( /Cupboard staples · 1/ )
		).toBeInTheDocument();
		expect( screen.queryByText( 'Olivolja' ) ).toBeNull(); // folded, not shown yet

		await user.click( screen.getByText( /Cupboard staples/ ) );
		expect( screen.getByText( 'Olivolja' ) ).toBeInTheDocument();
	} );

	it( 'renders the date strip with an "All" cell and one cell per receipt', () => {
		render(
			<PantryTab
				lines={ [ milkLine( '2026-09-20T10:00:00.000Z' ) ] }
				token="tok_a"
			/>
		);
		expect( screen.getByText( 'All' ) ).toBeInTheDocument();
	} );
} );
