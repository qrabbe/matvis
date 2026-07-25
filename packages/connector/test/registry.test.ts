import { describe, expect, it } from 'bun:test';
import { CoopConnector } from '../src/coop/connector';
import { getConnector, hasConnector, supportedStores } from '../src/registry';

describe('getConnector', () => {
  it('builds the connector for a supported slug', () => {
    const connector = getConnector('coop');
    expect(connector).toBeInstanceOf(CoopConnector);
    expect(connector.id).toBe('coop');
  });

  it('names the store in the error for an unbuilt slug', () => {
    expect(() => getConnector('ica')).toThrow('no connector for store "ica"');
  });

  it('passes the transport through to the connector', async () => {
    let seen = '';
    const connector = getConnector('coop', {
      fetch: async (url) => {
        seen = url;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ orderRef: 'order-1' }),
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
    });
    await connector.startAuth();
    expect(seen).toContain('/openid-connect/token');
  });
});

describe('supportedStores / hasConnector', () => {
  it('reports only the slugs that have an implementation', () => {
    expect(supportedStores()).toEqual(['coop']);
    expect(hasConnector('coop')).toBe(true);
    expect(hasConnector('ica')).toBe(false);
  });
});
