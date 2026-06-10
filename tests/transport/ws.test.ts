import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketServer, type WebSocket as WsType } from 'ws';
import { WsTransport, __setWsUrlForTesting } from '../../src/transport/ws.js';
import type { PriceData } from '../../src/types.js';

function getPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = new WebSocketServer({ port: 0 }, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function setupServer(): Promise<{ port: number; wss: WebSocketServer }> {
  const port = await getPort();
  const wss = new WebSocketServer({ port });
  __setWsUrlForTesting(`ws://127.0.0.1:${port}`);
  return { port, wss };
}

describe('WsTransport', () => {
  let wss: WebSocketServer | null = null;

  afterEach(() => {
    if (wss) {
      wss.close();
      wss = null;
    }
  });

  it('connects with apiKey in query string', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    const urlReceived = new Promise<string>((resolve) => {
      wss!.on('connection', (_ws, req) => {
        resolve(req.url ?? '');
      });
    });

    const transport = new WsTransport({
      apiKey: 'my-key',
      reconnect: false,
    });

    const unsub = transport.subscribe({
      feedIds: ['1'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    const url = await urlReceived;
    expect(url).toBe('/?apiKey=my-key');
    unsub();
  });

  it('sends correct subscription message for public feeds', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    const msgReceived = new Promise<Record<string, unknown>>((resolve) => {
      wss!.on('connection', (ws) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: false,
    });

    const unsub = transport.subscribe({
      feedIds: ['3323', '3325'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    const msg = await msgReceived;
    expect(msg).toEqual({
      method: 'SUBSCRIPTION',
      params: ['modix@auth.price@3323', 'modix@auth.price@3325'],
    });
    unsub();
  });

  it('sends correct subscription message for private feeds', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    const msgReceived = new Promise<Record<string, unknown>>((resolve) => {
      wss!.on('connection', (ws) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: false,
    });

    const unsub = transport.subscribe({
      feedIds: ['100'],
      feedType: 'private',
      onData: () => {},
      onError: () => {},
    });

    const msg = await msgReceived;
    expect(msg).toEqual({
      method: 'SUBSCRIPTION',
      params: ['modix@private.price@100'],
    });
    unsub();
  });

  it('parses push data and calls onData', async () => {
    const setup = await setupServer();
    wss = setup.wss;

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: {
              payload: '0xaa',
              signature: '0xbb',
              magicMarker: '0xcc',
            },
            t: 'price',
            c: '3323',
          }),
        );
      });
    });

    const received = new Promise<PriceData>((resolve) => {
      const transport = new WsTransport({
        apiKey: 'key',
        reconnect: false,
      });

      const unsub = transport.subscribe({
        feedIds: ['3323'],
        feedType: 'public',
        onData: (data) => {
          resolve(data);
          unsub();
        },
        onError: () => {},
      });
    });

    const data = await received;
    expect(data.extraData).toBe('0xaabbcc');
  });

  it('reconnects on close when reconnect=true', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    let connectionCount = 0;

    const secondConnection = new Promise<void>((resolve) => {
      wss!.on('connection', (ws) => {
        connectionCount++;
        if (connectionCount === 1) {
          ws.close();
        } else {
          resolve();
        }
      });
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: true,
      reconnectInterval: 50,
      maxReconnectAttempts: 3,
      pingInterval: 10000,
    });

    const unsub = transport.subscribe({
      feedIds: ['1'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    await secondConnection;
    expect(connectionCount).toBe(2);
    unsub();
  });

  it('calls onError after max reconnect attempts exceeded', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    wss.on('connection', (ws) => {
      ws.close();
    });

    const errorReceived = new Promise<Error>((resolve) => {
      const transport = new WsTransport({
        apiKey: 'key',
        reconnect: true,
        reconnectInterval: 30,
        maxReconnectAttempts: 2,
        pingInterval: 10000,
      });

      transport.subscribe({
        feedIds: ['1'],
        feedType: 'public',
        onData: () => {},
        onError: (err) => resolve(err),
      });
    });

    const err = await errorReceived;
    expect(err.message).toContain('Max reconnect attempts (2) exceeded');
  });

  it('resends subscription after reconnect', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    const messages: string[] = [];
    let connectionCount = 0;

    const secondMsg = new Promise<void>((resolve) => {
      wss!.on('connection', (ws) => {
        connectionCount++;
        ws.on('message', (data) => {
          messages.push(data.toString());
          if (connectionCount === 1) {
            ws.close();
          } else {
            resolve();
          }
        });
      });
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: true,
      reconnectInterval: 50,
      maxReconnectAttempts: 3,
      pingInterval: 10000,
    });

    const unsub = transport.subscribe({
      feedIds: ['42'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    await secondMsg;
    expect(messages).toHaveLength(2);
    expect(JSON.parse(messages[0])).toEqual(JSON.parse(messages[1]));
    unsub();
  });

  it('sends ping frames when reconnect=true', async () => {
    const setup = await setupServer();
    wss = setup.wss;

    const pingReceived = new Promise<void>((resolve) => {
      wss!.on('connection', (ws) => {
        ws.on('ping', () => resolve());
      });
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      pingInterval: 50,
    });

    const unsub = transport.subscribe({
      feedIds: ['1'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    await pingReceived;
    unsub();
  });

  it('ignores malformed non-JSON messages', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    let onDataCalled = false;
    let onErrorCalled = false;

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send('not json at all');
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              d: { payload: '0xaa', signature: '0xbb', magicMarker: '0xcc' },
              t: 'price',
              c: '1',
            }),
          );
        }, 50);
      });
    });

    const received = new Promise<PriceData>((resolve) => {
      const transport = new WsTransport({
        apiKey: 'key',
        reconnect: false,
      });

      const unsub = transport.subscribe({
        feedIds: ['1'],
        feedType: 'public',
        onData: (data) => {
          onDataCalled = true;
          resolve(data);
          unsub();
        },
        onError: () => {
          onErrorCalled = true;
        },
      });
    });

    const data = await received;
    expect(data.extraData).toBe('0xaabbcc');
    expect(onDataCalled).toBe(true);
    expect(onErrorCalled).toBe(true);
  });

  it('ignores messages missing d field', async () => {
    const setup = await setupServer();
    wss = setup.wss;

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(JSON.stringify({ t: 'heartbeat' }));
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              d: { payload: '0xaa', signature: '0xbb', magicMarker: '0xcc' },
              t: 'price',
              c: '1',
            }),
          );
        }, 50);
      });
    });

    const received = new Promise<PriceData>((resolve) => {
      const transport = new WsTransport({
        apiKey: 'key',
        reconnect: false,
      });

      const unsub = transport.subscribe({
        feedIds: ['1'],
        feedType: 'public',
        onData: (data) => {
          resolve(data);
          unsub();
        },
        onError: () => {},
      });
    });

    const data = await received;
    expect(data.extraData).toBe('0xaabbcc');
  });

  it('parses double-serialized d field (string)', async () => {
    const setup = await setupServer();
    wss = setup.wss;

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: JSON.stringify({ payload: '0xaa', signature: '0xbb', magicMarker: '0xcc' }),
            t: '1778154601131',
            c: 'modix@auth.price@640',
          }),
        );
      });
    });

    const received = new Promise<PriceData>((resolve) => {
      const transport = new WsTransport({
        apiKey: 'key',
        reconnect: false,
      });

      const unsub = transport.subscribe({
        feedIds: ['640'],
        feedType: 'public',
        onData: (data) => {
          resolve(data);
          unsub();
        },
        onError: () => {},
      });
    });

    const data = await received;
    expect(data.extraData).toBe('0xaabbcc');
  });

  it('calls onError when d field is invalid JSON string', async () => {
    const setup = await setupServer();
    wss = setup.wss;

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(
          JSON.stringify({
            d: '{invalid json',
            t: 'price',
            c: '1',
          }),
        );
      });
    });

    const err = await new Promise<Error>((resolve) => {
      const transport = new WsTransport({
        apiKey: 'key',
        reconnect: false,
      });

      transport.subscribe({
        feedIds: ['1'],
        feedType: 'public',
        onData: () => {},
        onError: (e) => resolve(e),
      });
    });

    expect(err.message).toContain('Failed to parse WebSocket message data');
  });

  it('does not reconnect when reconnect=false', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    let connectionCount = 0;

    wss.on('connection', (ws) => {
      connectionCount++;
      ws.close();
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: false,
    });

    const unsub = transport.subscribe({
      feedIds: ['1'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    await waitFor(200);
    expect(connectionCount).toBe(1);
    unsub();
  });

  it('fires onError on error event when reconnect=false', async () => {
    __setWsUrlForTesting('ws://127.0.0.1:1');
    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: false,
    });

    const err = await new Promise<Error>((resolve) => {
      transport.subscribe({
        feedIds: ['1'],
        feedType: 'public',
        onData: () => {},
        onError: (e) => resolve(e),
      });
    });

    expect(err.message).toContain('WebSocket error');
  });

  it('does not send ping when reconnect=false', async () => {
    const setup = await setupServer();
    wss = setup.wss;
    let pingReceived = false;

    wss.on('connection', (ws) => {
      ws.on('ping', () => {
        pingReceived = true;
      });
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: false,
    });

    const unsub = transport.subscribe({
      feedIds: ['1'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    await waitFor(200);
    expect(pingReceived).toBe(false);
    unsub();
  });

  it('cleans up on unsubscribe', async () => {
    const setup = await setupServer();
    wss = setup.wss;

    let serverWs: WsType | null = null;
    wss.on('connection', (ws) => {
      serverWs = ws;
    });

    const transport = new WsTransport({
      apiKey: 'key',
      reconnect: false,
    });

    const unsub = transport.subscribe({
      feedIds: ['1'],
      feedType: 'public',
      onData: () => {},
      onError: () => {},
    });

    await waitFor(50);
    expect(serverWs).not.toBeNull();

    unsub();
    await waitFor(50);
  });
});
