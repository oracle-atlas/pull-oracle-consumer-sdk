import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { PullOracleConsumerClient } from '../src/client.js';
import { __setWsUrlForTesting } from '../src/transport/ws.js';
import {
  PullOracleConsumerValidationError,
  PullOracleConsumerTransportError,
} from '../src/errors.js';
import type { PriceData } from '../src/types.js';

const DUMMY_SIG = '00'.repeat(65);
const MAGIC = '7096';

function buildExtraDataHex(timestamp: number): string {
  const feedId = '00000001';
  const value = '00000de0b6b3a7640000';
  const ts = timestamp.toString(16).padStart(12, '0');
  const pkg = feedId + value + ts;
  return pkg + '01' + DUMMY_SIG + MAGIC;
}

function getPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = new WebSocketServer({ port: 0 }, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Client.subscribe', () => {
  let wss: WebSocketServer | null = null;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (wss) {
      wss.close();
      wss = null;
    }
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('throws EMPTY_FEED_IDS on empty feedIds', () => {
    const client = new PullOracleConsumerClient({
      http: { apiKey: 'key' },
      ws: { apiKey: 'key', reconnect: false },
      validate: false,
    });

    expect(() => client.subscribe([], 'public', () => {})).toThrow(
      PullOracleConsumerValidationError,
    );
  });

  it('throws DUPLICATE_FEED_IDS on duplicate feedIds', () => {
    const client = new PullOracleConsumerClient({
      http: { apiKey: 'key' },
      ws: { apiKey: 'key', reconnect: false },
      validate: false,
    });

    expect(() => client.subscribe(['640', '640'], 'public', () => {})).toThrow(
      PullOracleConsumerValidationError,
    );
  });

  it('throws when ws transport is not configured', () => {
    const client = new PullOracleConsumerClient({
      http: { apiKey: 'key' },
      validate: false,
    });

    expect(() => client.subscribe(['1'], 'public', () => {})).toThrow(
      PullOracleConsumerTransportError,
    );
  });

  it('forwards valid WS data to onUpdate (validate=false)', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const now = Math.floor(Date.now() / 1000);
    const rawHex = buildExtraDataHex(now);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + rawHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    const received = await new Promise<PriceData>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: false,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        (data) => {
          resolve(data);
          unsub();
        },
      );
    });

    expect(received.extraData).toBe('0x' + rawHex);
  });

  it('falls back to HTTP when WS validation fails, then onUpdate', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const expired = Math.floor(Date.now() / 1000) - 600;
    const expiredHex = buildExtraDataHex(expired);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + expiredHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    const now = Math.floor(Date.now() / 1000);
    const freshHex = buildExtraDataHex(now);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            payload: '0x' + freshHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
            signature: '0x' + DUMMY_SIG,
            magicMarker: '0x' + MAGIC,
          },
          status: 200,
        }),
    });

    const received = await new Promise<PriceData>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        (data) => {
          resolve(data);
          unsub();
        },
      );
    });

    expect(received.extraData).toBe('0x' + freshHex);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('calls onError when WS validation fails and HTTP also fails', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const expired = Math.floor(Date.now() / 1000) - 600;
    const expiredHex = buildExtraDataHex(expired);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + expiredHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const err = await new Promise<Error>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        () => {},
        (e) => {
          resolve(e);
          unsub();
        },
      );
    });

    expect(err).toBeInstanceOf(PullOracleConsumerTransportError);
    expect(err.message).toContain('500');
  });

  it('subscribes with feedType=private', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const now = Math.floor(Date.now() / 1000);
    const rawHex = buildExtraDataHex(now);

    const msgReceived = new Promise<Record<string, unknown>>((resolve) => {
      wss!.on('connection', (ws) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
          ws.send(
            JSON.stringify({
              d: {
                payload: '0x' + rawHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
                signature: '0x' + DUMMY_SIG,
                magicMarker: '0x' + MAGIC,
              },
              t: 'price',
              c: '1',
            }),
          );
        });
      });
    });

    const received = new Promise<PriceData>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: false,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'private',
        (data) => {
          resolve(data);
          unsub();
        },
      );
    });

    const msg = await msgReceived;
    expect((msg.params as string[])[0]).toContain('modix@private.price@');

    const data = await received;
    expect(data.extraData).toBe('0x' + rawHex);
  });

  it('calls onUpdate when validate=true and data is valid', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const now = Math.floor(Date.now() / 1000);
    const rawHex = buildExtraDataHex(now);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + rawHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    const received = await new Promise<PriceData>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        (data) => {
          resolve(data);
          unsub();
        },
      );
    });

    expect(received.extraData).toBe('0x' + rawHex);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('prints debug info when debug=true on WS path', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const now = Math.floor(Date.now() / 1000);
    const rawHex = buildExtraDataHex(now);
    const consoleSpy = vi.spyOn(console, 'log');

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + rawHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    await new Promise<PriceData>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: false,
        debug: true,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        (data) => {
          resolve(data);
          unsub();
        },
      );
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[PullOracleConsumer] WS extraData:',
      expect.any(String),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[PullOracleConsumer] WS packages:',
      expect.any(Array),
    );
  });

  it('calls onError when HTTP fallback also fails validation', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const expired = Math.floor(Date.now() / 1000) - 600;
    const expiredHex = buildExtraDataHex(expired);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + expiredHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    const stillExpired = Math.floor(Date.now() / 1000) - 500;
    const stillExpiredHex = buildExtraDataHex(stillExpired);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            payload: '0x' + stillExpiredHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
            signature: '0x' + DUMMY_SIG,
            magicMarker: '0x' + MAGIC,
          },
          status: 200,
        }),
    });

    const err = await new Promise<Error>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        () => {},
        (e) => {
          resolve(e);
          unsub();
        },
      );
    });

    expect(err).toBeInstanceOf(PullOracleConsumerValidationError);
    expect((err as PullOracleConsumerValidationError).code).toBe('FEED_EXPIRED');
  });

  it('does not crash when onError is not provided', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const expired = Math.floor(Date.now() / 1000) - 600;
    const expiredHex = buildExtraDataHex(expired);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + expiredHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const client = new PullOracleConsumerClient({
      http: { apiKey: 'key' },
      ws: { apiKey: 'key', reconnect: false },
      validate: true,
      maxDelay: 300,
      maxFutureDrift: 60,
      maxPackageCount: 10,
      debug: false,
    });

    const unsub = client.subscribe(['1'], 'public', () => {});

    await new Promise((r) => setTimeout(r, 200));
    unsub();
  });

  it('unsubscribe stops receiving subsequent messages', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const now = Math.floor(Date.now() / 1000);
    const rawHex = buildExtraDataHex(now);
    let callCount = 0;

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        const sendMsg = () =>
          ws.send(
            JSON.stringify({
              d: {
                payload: '0x' + rawHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
                signature: '0x' + DUMMY_SIG,
                magicMarker: '0x' + MAGIC,
              },
              t: 'price',
              c: '1',
            }),
          );
        sendMsg();
        setTimeout(sendMsg, 100);
        setTimeout(sendMsg, 200);
      });
    });

    const client = new PullOracleConsumerClient({
      http: { apiKey: 'key' },
      ws: { apiKey: 'key', reconnect: false },
      validate: false,
      debug: false,
    });

    await new Promise<void>((resolve) => {
      const unsub = client.subscribe(
        ['1'],
        'public',
        () => {
          callCount++;
          unsub();
          setTimeout(resolve, 300);
        },
      );
    });

    expect(callCount).toBe(1);
  });

  it('skips validation when validate=false even with stale data', async () => {
    const port = await getPort();
    wss = new WebSocketServer({ port });
    __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
    const expired = Math.floor(Date.now() / 1000) - 600;
    const expiredHex = buildExtraDataHex(expired);

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0x' + expiredHex.slice(0, -(DUMMY_SIG.length + MAGIC.length)),
              signature: '0x' + DUMMY_SIG,
              magicMarker: '0x' + MAGIC,
            },
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    const received = await new Promise<PriceData>((resolve) => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        ws: { apiKey: 'key', reconnect: false },
        validate: false,
        debug: false,
      });

      const unsub = client.subscribe(
        ['1'],
        'public',
        (data) => {
          resolve(data);
          unsub();
        },
      );
    });

    expect(received.extraData).toBe('0x' + expiredHex);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
