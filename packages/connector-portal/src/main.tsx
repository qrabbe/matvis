import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { mountApp, requireConvexUrl } from '@matvis/ui';
import { App } from './App';

const convex = new ConvexReactClient(
  requireConvexUrl('packages/connector-portal/.env.local'),
);

mountApp({ client: convex, Provider: ConvexAuthProvider, children: <App /> });
