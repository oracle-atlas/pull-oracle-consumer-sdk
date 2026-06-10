import WebSocket from 'ws';
import type { WsTransportConfig, PriceData, FeedType } from '../types.js';
import { assembleExtraData } from '../parser.js';
import { PullOracleConsumerTransportError } from '../errors.js';

export interface WsSubscribeOptions {
  feedIds: string[];
  feedType: FeedType;
  onData: (data: PriceData) => void;
  onError: (err: Error) => void;
}

interface WsMessage {
  d: {
    payload: string;
    signature: string;
    magicMarker: string;
  };
  t: string;
  c: string;
}

function isWsDataMessage(msg: unknown): msg is WsMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  if (typeof obj.d !== 'object' || obj.d === null) return false;
  const d = obj.d as Record<string, unknown>;
  return (
    typeof d.payload === 'string' &&
    typeof d.signature === 'string' &&
    typeof d.magicMarker === 'string'
  );
}

let WS_URL = 'wss://push.atlasoracle.io/ws';

/** @internal — for testing only. Do not use in production. */
export function __setWsUrlForTesting(url: string): void {
  WS_URL = url;
}

export class WsTransport {
  private readonly config: WsTransportConfig;

  constructor(config: WsTransportConfig) {
    this.config = config;
  }

  subscribe(options: WsSubscribeOptions): () => void {
    const { feedIds, feedType, onData, onError } = options;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempts = 0;
    let closed = false;

    const buildSubscriptionParams = (): string[] => {
      const prefix = feedType === 'public' ? 'modix@auth.price@' : 'modix@private.price@';
      return feedIds.map((id) => `${prefix}${id}`);
    };

    const sendSubscription = (socket: WebSocket) => {
      socket.send(
        JSON.stringify({
          method: 'SUBSCRIPTION',
          params: buildSubscriptionParams(),
        }),
      );
    };

    const startPing = (socket: WebSocket) => {
      if (this.config.reconnect) {
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
          }
        }, this.config.pingInterval);
      }
    };

    const clearPing = () => {
      if (pingTimer !== null) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const connect = () => {
      if (closed) return;

      const url = `${WS_URL}?apiKey=${this.config.apiKey}`;
      ws = new WebSocket(url);

      ws.on('open', () => {
        sendSubscription(ws!);
        startPing(ws!);
      });

      ws.on('message', (raw: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          onError(new PullOracleConsumerTransportError('Failed to parse WebSocket message'));
          return;
        }

        if (msg && typeof msg === 'object') {
          const obj = msg as Record<string, unknown>;
          if (typeof obj.d === 'string') {
            try {
              obj.d = JSON.parse(obj.d);
            } catch {
              onError(new PullOracleConsumerTransportError('Failed to parse WebSocket message data'));
              return;
            }
          }
        }

        if (!isWsDataMessage(msg)) {
          return;
        }

        try {
          reconnectAttempts = 0;
          const extraData = assembleExtraData(msg.d.payload, msg.d.signature, msg.d.magicMarker);
          onData({ extraData });
        } catch (err) {
          onError(
            new PullOracleConsumerTransportError(
              'Failed to process WebSocket data',
              undefined,
              err instanceof Error ? err : undefined,
            ),
          );
        }
      });

      ws.on('close', () => {
        clearPing();
        if (closed) return;

        if (this.config.reconnect) {
          reconnectAttempts++;
          if (reconnectAttempts > this.config.maxReconnectAttempts) {
            onError(
              new PullOracleConsumerTransportError(
                `Max reconnect attempts (${this.config.maxReconnectAttempts}) exceeded`,
              ),
            );
            return;
          }
          setTimeout(connect, this.config.reconnectInterval);
        }
      });

      ws.on('error', (err: Error) => {
        if (!this.config.reconnect) {
          onError(new PullOracleConsumerTransportError('WebSocket error', undefined, err));
        }
      });
    };

    connect();

    return () => {
      closed = true;
      clearPing();
      if (ws) {
        ws.removeAllListeners();
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
      }
    };
  }
}
