import { httpRouter } from 'convex/server';
import { auth } from './auth';

// Convex Auth serves its OAuth callback + JWKS endpoints on the deployment's
// HTTP router.
// This file is the whole reason getUserIdentity() can verify a
// token; without the routes, sign-in silently never completes.
const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
