import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../src/transport/http.js';
import { PullOracleConsumerTransportError } from '../../src/errors.js';

const BASE_URL = 'https://api.atlasoracle.io';
const API_KEY = 'test-api-key';

const mockResponseData = {
  data: {
    payload: '0xaabbcc',
    signature: '0x112233',
    magicMarker: '0x7096',
  },
  status: 200,
};

describe('HttpTransport', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct request format', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponseData),
    });

    const transport = new HttpTransport({ apiKey: API_KEY });
    await transport.fetchPrices(['3323', '3325']);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/report/v1/price/latest`);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-API-KEY']).toBe('test-api-key');
    expect(JSON.parse(options.body)).toEqual({
      feedIds: ['3323', '3325'],
      signed: true,
    });
  });

  it('assembles extraData correctly', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponseData),
    });

    const transport = new HttpTransport({ apiKey: API_KEY });
    const result = await transport.fetchPrices(['3323']);

    expect(result.extraData).toBe('0xaabbcc1122337096');
  });

  it('throws TransportError on 401', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const transport = new HttpTransport({ apiKey: API_KEY });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow(PullOracleConsumerTransportError);
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('HTTP 401');
  });

  it('throws TransportError on 403', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const transport = new HttpTransport({ apiKey: API_KEY });

    try {
      await transport.fetchPrices(['1']);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PullOracleConsumerTransportError);
      expect((e as PullOracleConsumerTransportError).statusCode).toBe(403);
    }
  });

  it('throws TransportError on 429', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const transport = new HttpTransport({ apiKey: API_KEY });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('HTTP 429');
  });

  it('throws TransportError on 500', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const transport = new HttpTransport({ apiKey: API_KEY });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('HTTP 500');
  });

  it('throws TransportError on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const transport = new HttpTransport({ apiKey: API_KEY });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow(PullOracleConsumerTransportError);
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('Network request failed');
  });

  it('throws TransportError on timeout', async () => {
    const timeoutError = new DOMException('The operation was aborted.', 'TimeoutError');
    fetchSpy.mockRejectedValue(timeoutError);

    const transport = new HttpTransport({ apiKey: API_KEY, timeout: 5000 });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('timed out after 5000ms');
  });

  it('throws TransportError when response has no data field', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 200 }),
    });

    const transport = new HttpTransport({ apiKey: API_KEY });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow(PullOracleConsumerTransportError);
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('Unexpected response');
  });

  it('uses custom timeout value', async () => {
    const timeoutError = new DOMException('The operation was aborted.', 'TimeoutError');
    fetchSpy.mockRejectedValue(timeoutError);

    const transport = new HttpTransport({ apiKey: API_KEY, timeout: 3000 });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('timed out after 3000ms');
  });

  it('uses default timeout of 10000ms', async () => {
    const timeoutError = new DOMException('The operation was aborted.', 'TimeoutError');
    fetchSpy.mockRejectedValue(timeoutError);

    const transport = new HttpTransport({ apiKey: API_KEY });
    await expect(transport.fetchPrices(['1'])).rejects.toThrow('timed out after 10000ms');
  });
});
