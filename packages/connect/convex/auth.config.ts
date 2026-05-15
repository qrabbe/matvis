// No provider wired yet (auth deferred). This file exists so the auth plumbing is
// in place; ctx.auth.getUserIdentity() returns null until a real provider is added
// here, at which point the dev-subject fallback (ALLOW_DEV_SUBJECT) is removed.
//
// An empty `providers` array is valid and keeps getUserIdentity() returning null
// without error. When real auth lands, add `{ domain, applicationID }` here — the
// `domain` must be the JWT issuer URL (Convex fetches
// {domain}/.well-known/openid-configuration to discover the JWKS endpoint).
export default { providers: [] as { domain: string; applicationID: string }[] };
