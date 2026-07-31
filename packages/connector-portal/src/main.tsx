import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { mountApp, requireConvexUrl } from '@matvis/ui';
import { App } from './App';

const convex = new ConvexReactClient(
  requireConvexUrl('packages/connector-portal/.env.local'),
);

// `ConvexAuthProvider` supplies the auth context (token storage + refresh) that
// the connector's identity seam reads via `getUserIdentity()`. The App gates its
// body on `<Authenticated>` / `<Unauthenticated>` (GitHub sign-in).
mountApp({ client: convex, Provider: ConvexAuthProvider, children: <App /> });
