import type { Abi } from 'viem';
import type {
  PullOracleConsumerClientConfig,
  PriceData,
  Hex,
  ChainAdapter,
  FeedType,
} from './types.js';
import { HttpTransport } from './transport/http.js';
import { WsTransport } from './transport/ws.js';
import { validatePriceData } from './validator.js';
import { parseExtraData } from './parser.js';
import { buildCalldata } from './builder.js';
import {
  PullOracleConsumerValidationError,
  PullOracleConsumerTransportError,
} from './errors.js';

export interface ExecuteParams {
  feedIds: string[];
  abi: Abi;
  functionName: string;
  args: unknown[];
  to: Hex;
  value?: bigint;
  chainAdapter: ChainAdapter;
}

export class PullOracleConsumerClient {
  private readonly config: PullOracleConsumerClientConfig;
  private readonly httpTransport: HttpTransport;
  private readonly wsTransport: WsTransport | null;

  constructor(config: PullOracleConsumerClientConfig) {
    this.config = config;
    this.httpTransport = new HttpTransport(config.http);
    this.wsTransport = config.ws ? new WsTransport(config.ws) : null;
  }

  async fetchPrices(feedIds: string[]): Promise<PriceData> {
    if (feedIds.length === 0) {
      throw new PullOracleConsumerValidationError(
        'EMPTY_FEED_IDS',
        'feedIds must not be empty',
      );
    }

    if (new Set(feedIds).size !== feedIds.length) {
      throw new PullOracleConsumerValidationError(
        'DUPLICATE_FEED_IDS',
        'feedIds must not contain duplicates',
      );
    }

    const priceData = await this.httpTransport.fetchPrices(feedIds);

    if (this.config.validate) {
      const packages = validatePriceData(priceData.extraData, {
        maxDelay: this.config.maxDelay,
        maxFutureDrift: this.config.maxFutureDrift,
        maxPackageCount: this.config.maxPackageCount,
      });
      if (this.config.debug) {
        console.log('[PullOracleConsumer] extraData:', priceData.extraData);
        console.log('[PullOracleConsumer] packages:', packages);
      }
    } else if (this.config.debug) {
      const { packages } = parseExtraData(priceData.extraData);
      console.log('[PullOracleConsumer] extraData:', priceData.extraData);
      console.log('[PullOracleConsumer] packages:', packages);
    }

    return priceData;
  }

  buildCalldata(params: { abi: Abi; functionName: string; args: unknown[]; extraData: Hex }): Hex {
    return buildCalldata(params);
  }

  async sendTransaction(params: {
    to: Hex;
    data: Hex;
    value?: bigint;
    chainAdapter: ChainAdapter;
  }): Promise<Hex> {
    return params.chainAdapter.sendTransaction({
      to: params.to,
      data: params.data,
      value: params.value,
    });
  }

  subscribe(
    feedIds: string[],
    feedType: FeedType,
    onUpdate: (data: PriceData) => void,
    onError?: (err: Error) => void,
  ): () => void {
    if (feedIds.length === 0) {
      throw new PullOracleConsumerValidationError('EMPTY_FEED_IDS', 'feedIds must not be empty');
    }

    if (new Set(feedIds).size !== feedIds.length) {
      throw new PullOracleConsumerValidationError(
        'DUPLICATE_FEED_IDS',
        'feedIds must not contain duplicates',
      );
    }

    if (!this.wsTransport) {
      throw new PullOracleConsumerTransportError('WebSocket transport is not configured');
    }

    return this.wsTransport.subscribe({
      feedIds,
      feedType,
      onData: (data: PriceData) => {
        if (this.config.validate) {
          try {
            const packages = validatePriceData(data.extraData, {
              maxDelay: this.config.maxDelay,
              maxFutureDrift: this.config.maxFutureDrift,
              maxPackageCount: this.config.maxPackageCount,
            });
            if (this.config.debug) {
              console.log('[PullOracleConsumer] WS extraData:', data.extraData);
              console.log('[PullOracleConsumer] WS packages:', packages);
            }
          } catch (wsValidationErr) {
            if (this.config.debug) {
              console.log('[PullOracleConsumer] WS validation failed, falling back to HTTP:', wsValidationErr);
            }
            this.httpTransport
              .fetchPrices(feedIds)
              .then((httpData) => {
                if (this.config.validate) {
                  const packages = validatePriceData(httpData.extraData, {
                    maxDelay: this.config.maxDelay,
                    maxFutureDrift: this.config.maxFutureDrift,
                    maxPackageCount: this.config.maxPackageCount,
                  });
                  if (this.config.debug) {
                    console.log('[PullOracleConsumer] WS fallback HTTP extraData:', httpData.extraData);
                    console.log('[PullOracleConsumer] WS fallback HTTP packages:', packages);
                  }
                }
                onUpdate(httpData);
              })
              .catch((httpErr) => {
                onError?.(httpErr instanceof Error ? httpErr : new Error(String(httpErr)));
              });
            return;
          }
        } else if (this.config.debug) {
          const { packages } = parseExtraData(data.extraData);
          console.log('[PullOracleConsumer] WS extraData:', data.extraData);
          console.log('[PullOracleConsumer] WS packages:', packages);
        }
        onUpdate(data);
      },
      onError: (err) => {
        onError?.(err);
      },
    });
  }

  async execute(params: ExecuteParams): Promise<Hex> {
    if (params.feedIds.length === 0) {
      throw new PullOracleConsumerValidationError(
        'EMPTY_FEED_IDS',
        'feedIds must not be empty',
      );
    }

    if (new Set(params.feedIds).size !== params.feedIds.length) {
      throw new PullOracleConsumerValidationError(
        'DUPLICATE_FEED_IDS',
        'feedIds must not contain duplicates',
      );
    }

    const priceData = await this.fetchPrices(params.feedIds);

    const calldata = this.buildCalldata({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      extraData: priceData.extraData,
    });

    return this.sendTransaction({
      to: params.to,
      data: calldata,
      value: params.value,
      chainAdapter: params.chainAdapter,
    });
  }
}
