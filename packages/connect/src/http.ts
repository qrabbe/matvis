/**
 * The `fetch` signature the connector depends on. Injected instead of using the
 * global `fetch` so tests can pass a stub (no network or mocking framework)
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<HttpResponse>;

/** The subset of `Response` the connector relies on. */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Default {@link FetchLike} backed by the global `fetch` (whose `Response`
 * satisfies {@link HttpResponse}). In the browser, inject a client pointed at
 * the dev proxy instead since browsers forbid the `Host`/`User-Agent` headers Coop
 * expects.
 */
export const defaultFetch: FetchLike = (input, init) =>
  fetch(input, init) as unknown as Promise<HttpResponse>;
