import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { mountApp, requireConvexUrl } from '@matvis/ui';
import { App } from './App';

const convex = new ConvexReactClient(
  requireConvexUrl('packages/app/.env.local'),
);

// `ConvexProvider`, NOT `ConvexAuthProvider` — and that absence is the whole
// read-only story. Every connector write (`links.*`, `sync.sync`,
// `accessToken.create`) resolves the caller through `getAuthUserId` and throws
// `Unauthenticated` when there is no session, so with no auth context mounted
// the app cannot reach a write handler at all. It authenticates with the account
// API token instead, which the read API accepts on its own. The catalog needs no
// equivalent: its entire public surface is queries.
//
// The catalog deployment is deliberately NOT a provider here — `useQuery`
// resolves one client from context, so the second deployment is called
// imperatively (see lib/catalogClient.ts).
mountApp({ client: convex, Provider: ConvexProvider, children: <App /> });
