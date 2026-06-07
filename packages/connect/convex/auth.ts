import GitHub from '@auth/core/providers/github';
import { convexAuth } from '@convex-dev/auth/server';

// The connector's login. GitHub OAuth is the only provider — a logged-in user's
// identity flows into the auth seam (model/auth.ts → `getUserIdentity()`), which
// derives the connector `accounts.subject`. Requires AUTH_GITHUB_ID /
// AUTH_GITHUB_SECRET on the deployment (see the OAuth-app setup in the README).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub],
});
