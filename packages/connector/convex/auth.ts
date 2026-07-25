import GitHub from '@auth/core/providers/github';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { convexAuth } from '@convex-dev/auth/server';

// The connector's login.
// Providers:
//  - GitHub OAuth — requires AUTH_GITHUB_ID / AUTH_GITHUB_SECRET (see README).
//  - Anonymous (provider id `anonymous`), sets`isAnonymous: true`
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Anonymous],
});
