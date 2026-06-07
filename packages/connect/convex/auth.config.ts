// Convex Auth is a self-issued OIDC provider: the deployment signs its own JWTs
// (JWT_PRIVATE_KEY) and serves the matching JWKS from its HTTP router (http.ts).
//
// FOOTGUN: `domain` MUST be CONVEX_SITE_URL — the deployment's `.convex.site`
// origin (where the JWKS lives), NOT the `.convex.cloud` client URL. Getting
// this wrong makes every request silently unauthenticated with no error.
// `applicationID: 'convex'` is the fixed audience Convex Auth mints tokens for.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
};
