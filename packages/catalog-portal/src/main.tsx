import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { mountApp, requireConvexUrl } from '@matvis/ui';
import { App } from './App';

const convex = new ConvexReactClient(
  requireConvexUrl('packages/catalog-portal/.env.local'),
);

// No auth: the catalog portal reads only the public, clean catalog table, so a
// plain `ConvexProvider` (no token storage) is all it needs.
mountApp({ client: convex, Provider: ConvexProvider, children: <App /> });
