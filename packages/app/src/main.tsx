import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { mountApp, requireConvexUrl } from '@matvis/ui';
import { App } from './App';

const convex = new ConvexReactClient(
  requireConvexUrl('packages/app/.env.local'),
);

mountApp({ client: convex, Provider: ConvexProvider, children: <App /> });
