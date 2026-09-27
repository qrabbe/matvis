import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { header, item, line, purchaseData } from '../support/fixtures';

vi.mock( '../../src/hooks/use-marks', () => ( {
	useMarks: () => ( {
		available: true,
		marks: [],
		mark: async () => {},
		markMany: async () => {},
		unmark: async () => {},
		error: null,
	} ),
} ) );

vi.mock( 'convex/react', () => ( {
	useQuery: () => null,
	useMutation: () => async () => {},
} ) );

const { PurchasesTab } = await import( '../../src/features/purchases-tab' );

beforeEach( () => {
	vi.clearAllMocks();
} );

function receiptWithLines() {
	const h = header( {
		_id: 'r1' as ReturnType< typeof header >[ '_id' ],
		purchasedAt: '2026-09-20T17:00:00.000Z',
		total: 51.8,
	} );
	const milk = line( {
		item: item( {
			lineNo: 0,
			text: 'MJÖLK 15,95',
			price: 15.95,
			gtin: '111',
			kind: 'product',
		} ),
		header: h,
		purchasedAt: new Date( '2026-09-20T17:00:00.000Z' ),
	} );
	const discounted = line( {
		item: item( {
			lineNo: 1,
			text: 'PAN PIZZA 3 för 33kr',
			price: 33,
			gtin: '222',
			kind: 'product',
		} ),
		header: h,
		purchasedAt: new Date( '2026-09-20T17:00:00.000Z' ),
	} );
	const discount = line( {
		item: item( {
			lineNo: 2,
			text: 'RABATT',
			price: -2.5,
			isDiscount: true,
			kind: undefined,
			gtin: undefined,
		} ),
		header: h,
		purchasedAt: new Date( '2026-09-20T17:00:00.000Z' ),
	} );
	const nonFood = line( {
		item: item( {
			lineNo: 3,
			text: 'PAPPERSKASSE',
			price: 2,
			kind: 'notFood',
			gtin: undefined,
		} ),
		header: h,
		purchasedAt: new Date( '2026-09-20T17:00:00.000Z' ),
	} );

	const lines = [ milk, discounted, discount, nonFood ];
	return purchaseData( {
		headers: [ h ],
		lines,
		linesByReceipt: new Map( [ [ 'r1', lines ] ] ),
	} );
}

describe( 'PurchasesTab', () => {
	it( 'shows the spending overview above the receipts', () => {
		render( <PurchasesTab data={ receiptWithLines() } token="tok_a" /> );
		expect( screen.getByText( 'Total spend' ) ).toBeInTheDocument();
	} );

	it( 'lists a receipt row with its spend', () => {
		render( <PurchasesTab data={ receiptWithLines() } token="tok_a" /> );
		// 15.95 + 33 + 2 (papperskasse; discounts don't reach `spend`) ≈ 51 kr
		expect( screen.getByText( '51 kr' ) ).toBeInTheDocument();
	} );

	it( 'opening a receipt shows food lines with discounts folded and hides non-food', async () => {
		const user = userEvent.setup();
		render( <PurchasesTab data={ receiptWithLines() } token="tok_a" /> );

		await user.click( screen.getByRole( 'button', { name: /Coop/ } ) );

		expect( screen.getByText( /MJÖLK/ ) ).toBeInTheDocument();
		expect( screen.queryByText( 'PAPPERSKASSE' ) ).toBeNull();
		// 33 - 2.50 = 30.50, folded onto the pizza line and rounded for display
		expect( screen.getByText( '31 kr' ) ).toBeInTheDocument();
	} );

	it( 'opening a line shows the Printed → Parsed → Identified → Pantry → Counted chain', async () => {
		const user = userEvent.setup();
		render( <PurchasesTab data={ receiptWithLines() } token="tok_a" /> );

		await user.click( screen.getByRole( 'button', { name: /Coop/ } ) );
		await user.click( screen.getByRole( 'button', { name: /MJÖLK/ } ) );

		expect( screen.getByText( 'Printed' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Parsed' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Identified' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Pantry' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Counted' ) ).toBeInTheDocument();
	} );
} );
