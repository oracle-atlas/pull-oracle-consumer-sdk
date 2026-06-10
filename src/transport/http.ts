import type { HttpTransportConfig, PriceData, Hex } from '../types.js';
import { assembleExtraData } from '../parser.js';
import { PullOracleConsumerTransportError } from '../errors.js';

interface HttpResponseData {
  payload: string;
  signature: string;
  magicMarker: string;
}

interface HttpResponseStatus {
  error_code: string;
  error_message: string;
}

interface HttpResponse {
  data: HttpResponseData;
  status: HttpResponseStatus;
}

const BASE_URL = 'https://api.atlasoracle.io';

export class HttpTransport {
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: HttpTransportConfig) {
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10000;
  }

  async fetchPrices(feedIds: string[]): Promise<PriceData> {
    const body: Record<string, unknown> = { signed: true, feedIds };

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/report/v1/price/latest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new PullOracleConsumerTransportError(
          `Request timed out after ${this.timeout}ms`,
          undefined,
          err,
        );
      }
      throw new PullOracleConsumerTransportError(
        'Network request failed',
        undefined,
        err instanceof Error ? err : undefined,
      );
    }

    if (!res.ok) {
      throw new PullOracleConsumerTransportError(
        `HTTP ${res.status}: ${res.statusText}`,
        res.status,
      );
    }

    let json: HttpResponse;
    try {
      json = (await res.json()) as HttpResponse;
    } catch (err) {
      throw new PullOracleConsumerTransportError(
        'Failed to parse response JSON',
        res.status,
        err instanceof Error ? err : undefined,
      );
    }

    if (json.status && typeof json.status === 'object' && json.status.error_code !== '0') {
      throw new PullOracleConsumerTransportError(
        `API error ${json.status.error_code}: ${json.status.error_message}`,
        res.status,
      );
    }

    if (!json.data) {
      throw new PullOracleConsumerTransportError(
        `Unexpected response: data is ${JSON.stringify(json)}`,
        res.status,
      );
    }
    const { payload, signature, magicMarker } = json.data;
    const extraData: Hex = assembleExtraData(payload, signature, magicMarker);

    return { extraData };
  }
}
