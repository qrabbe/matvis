import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { mountApp, requireConvexUrl } from '@matvis/ui';
import { App } from './App';

const convex = new ConvexReactClient(
	requireConvexUrl(
		'packages/catalog-portal/.env.local',
		'VITE_CATALOG_CONVEX_URL'
	)
);

mountApp( { client: convex, Provider: ConvexProvider, children: <App /> } );
