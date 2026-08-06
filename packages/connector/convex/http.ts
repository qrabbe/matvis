import { httpRouter } from 'convex/server';
import { auth } from './auth';

const http = httpRouter();
// Without these routes sign-in silently never completes.
auth.addHttpRoutes(http);
export default http;
