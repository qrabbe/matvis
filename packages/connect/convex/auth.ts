import GitHub from '@auth/core/providers/github';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { convexAuth } from '@convex-dev/auth/server';

// The connector's login. Either provider establishes the same connector
// identity: a logged-in user flows into the auth seam (model/auth.ts →
// `getUserIdentity()`), which derives the connector `accounts.subject`.
//
// Providers:
//  - GitHub OAuth — requires AUTH_GITHUB_ID / AUTH_GITHUB_SECRET (see README).
//  - Anonymous (provider id `anonymous`) — a zero-friction guest login, no
//    email/domain needed. The user row is tagged `isAnonymous: true`, which a
//    later cleanup cron can use to expire guest accounts + their data.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Anonymous],
});
