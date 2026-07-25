// Convex Auth is a self-issued OIDC provider: the deployment signs its own JWTs
// (JWT_PRIVATE_KEY) and serves the matching JWKS from its HTTP router (http.ts).
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
};
