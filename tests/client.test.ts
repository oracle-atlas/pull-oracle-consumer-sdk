import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PullOracleConsumerClient } from '../src/client.js';
import { PullOracleConsumerValidationError, PullOracleConsumerTransportError } from '../src/errors.js';
import type { ChainAdapter, Hex } from '../src/types.js';

const DUMMY_SIG = '00'.repeat(65);
const MAGIC = '7096';

function buildMockExtraData(timestamp: number): string {
  const feedId = '00000001';
  const value = '00000de0b6b3a7640000';
  const ts = timestamp.toString(16).padStart(12, '0');
  const pkg = feedId + value + ts;
  return '0x' + pkg + '01' + DUMMY_SIG + MAGIC;
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeMockResponse(extraDataHex?: string) {
  const payload = extraDataHex
    ? extraDataHex.slice(2, -(DUMMY_SIG.length + MAGIC.length))
    : 'aabb';
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          payload: '0x' + payload,
          signature: '0x' + DUMMY_SIG,
          magicMarker: '0x' + MAGIC,
        },
        status: 200,
      }),
  };
}

function createMockChainAdapter(): ChainAdapter {
  return {
    sendTransaction: vi.fn().mockResolvedValue('0xtxhash' as Hex),
  };
}

const testAbi = [
  {
    name: 'update',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'id', type: 'uint256' as const }],
    outputs: [],
  },
];

describe('PullOracleConsumerClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  describe('fetchPrices', () => {
    it('throws EMPTY_FEED_IDS when feedIds is empty array', async () => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      await expect(client.fetchPrices([])).rejects.toThrow(PullOracleConsumerValidationError);
      await expect(client.fetchPrices([])).rejects.toThrow('feedIds must not be empty');
    });

    it('throws DUPLICATE_FEED_IDS when feedIds has duplicates', async () => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      await expect(client.fetchPrices(['640', '640'])).rejects.toThrow(
        PullOracleConsumerValidationError,
      );
      await expect(client.fetchPrices(['640', '640'])).rejects.toThrow(
        'feedIds must not contain duplicates',
      );
    });

    it('returns priceData from HTTP transport', async () => {
      const now = Math.floor(Date.now() / 1000);
      const extraData = buildMockExtraData(now);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
        debug: false,
      });

      const result = await client.fetchPrices(['1']);
      expect(result.extraData).toBe(extraData);
    });

    it('validates when validate=true and throws on expired', async () => {
      const expired = Math.floor(Date.now() / 1000) - 600;
      const extraData = buildMockExtraData(expired);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      try {
        await client.fetchPrices(['1']);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
        expect((e as PullOracleConsumerValidationError).code).toBe('FEED_EXPIRED');
      }
    });

    it('skips validation when validate=false', async () => {
      const expired = Math.floor(Date.now() / 1000) - 600;
      const extraData = buildMockExtraData(expired);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
        debug: false,
      });

      const result = await client.fetchPrices(['1']);
      expect(result.extraData).toBe(extraData);
    });

    it('does not print debug info when debug is default (false)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const extraData = buildMockExtraData(now);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));
      const consoleSpy = vi.spyOn(console, 'log');

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      await client.fetchPrices(['1']);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('prints debug info when debug=true', async () => {
      const now = Math.floor(Date.now() / 1000);
      const extraData = buildMockExtraData(now);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));
      const consoleSpy = vi.spyOn(console, 'log');

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
        debug: true,
      });

      await client.fetchPrices(['1']);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PullOracleConsumer] extraData:',
        expect.any(String),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PullOracleConsumer] packages:',
        expect.any(Array),
      );
    });

    it('validates and throws EXCEEDS_MAX_PACKAGE_COUNT when validate=true', async () => {
      const now = Math.floor(Date.now() / 1000);
      const feedId1 = '00000001';
      const feedId2 = '00000002';
      const feedId3 = '00000003';
      const value = '00000de0b6b3a7640000';
      const ts = now.toString(16).padStart(12, '0');
      const pkg1 = feedId1 + value + ts;
      const pkg2 = feedId2 + value + ts;
      const pkg3 = feedId3 + value + ts;
      const extraData = '0x' + pkg1 + pkg2 + pkg3 + '03' + DUMMY_SIG + MAGIC;

      mockFetch.mockResolvedValue(makeMockResponse(extraData));

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 2,
        debug: false,
      });

      try {
        await client.fetchPrices(['1', '2', '3']);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
        expect((e as PullOracleConsumerValidationError).code).toBe('EXCEEDS_MAX_PACKAGE_COUNT');
      }
    });

    it('validates and throws FEED_FUTURE_DRIFT when validate=true', async () => {
      const future = Math.floor(Date.now() / 1000) + 300;
      const extraData = buildMockExtraData(future);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      try {
        await client.fetchPrices(['1']);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
        expect((e as PullOracleConsumerValidationError).code).toBe('FEED_FUTURE_DRIFT');
      }
    });

    it('returns data when validate=true and data is valid', async () => {
      const now = Math.floor(Date.now() / 1000);
      const extraData = buildMockExtraData(now);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      const result = await client.fetchPrices(['1']);
      expect(result.extraData).toBe(extraData);
    });
  });

  describe('sendTransaction', () => {
    it('delegates to chainAdapter', async () => {
      const adapter = createMockChainAdapter();
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      const txHash = await client.sendTransaction({
        to: '0x0000000000000000000000000000000000000001',
        data: '0xdeadbeef',
        chainAdapter: adapter,
      });

      expect(txHash).toBe('0xtxhash');
      expect(adapter.sendTransaction).toHaveBeenCalledWith({
        to: '0x0000000000000000000000000000000000000001',
        data: '0xdeadbeef',
        value: undefined,
      });
    });

    it('passes value parameter to chainAdapter', async () => {
      const adapter = createMockChainAdapter();
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      await client.sendTransaction({
        to: '0x0000000000000000000000000000000000000001',
        data: '0xdeadbeef',
        value: 1000000000000000000n,
        chainAdapter: adapter,
      });

      expect(adapter.sendTransaction).toHaveBeenCalledWith({
        to: '0x0000000000000000000000000000000000000001',
        data: '0xdeadbeef',
        value: 1000000000000000000n,
      });
    });
  });

  describe('buildCalldata', () => {
    it('delegates to builder module', () => {
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      const result = client.buildCalldata({
        abi: testAbi,
        functionName: 'update',
        args: [1n],
        extraData: '0xaabb',
      });

      expect(result.startsWith('0x')).toBe(true);
      expect(result.endsWith('aabb')).toBe(true);
    });
  });

  describe('execute', () => {
    it('orchestrates fetchPrices + buildCalldata + sendTransaction', async () => {
      const now = Math.floor(Date.now() / 1000);
      const extraData = buildMockExtraData(now);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));
      const adapter = createMockChainAdapter();

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
        debug: false,
      });

      const txHash = await client.execute({
        feedIds: ['1'],
        abi: testAbi,
        functionName: 'update',
        args: [1n],
        to: '0x0000000000000000000000000000000000000001',
        chainAdapter: adapter,
      });

      expect(txHash).toBe('0xtxhash');
      expect(adapter.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '0x0000000000000000000000000000000000000001',
          data: expect.stringMatching(/^0x/),
        }),
      );
    });

    it('throws EMPTY_FEED_IDS on empty feedIds', async () => {
      const adapter = createMockChainAdapter();
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      try {
        await client.execute({
          feedIds: [],
          abi: testAbi,
          functionName: 'update',
          args: [1n],
          to: '0x0000000000000000000000000000000000000001',
          chainAdapter: adapter,
        });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
        expect((e as PullOracleConsumerValidationError).code).toBe('EMPTY_FEED_IDS');
      }
    });

    it('throws DUPLICATE_FEED_IDS on duplicate feedIds', async () => {
      const adapter = createMockChainAdapter();
      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
      });

      try {
        await client.execute({
          feedIds: ['1', '1'],
          abi: testAbi,
          functionName: 'update',
          args: [1n],
          to: '0x0000000000000000000000000000000000000001',
          chainAdapter: adapter,
        });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
        expect((e as PullOracleConsumerValidationError).code).toBe('DUPLICATE_FEED_IDS');
      }
    });

    it('validates when validate=true before sending transaction', async () => {
      const expired = Math.floor(Date.now() / 1000) - 600;
      const extraData = buildMockExtraData(expired);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));
      const adapter = createMockChainAdapter();

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: true,
        maxDelay: 300,
        maxFutureDrift: 60,
        maxPackageCount: 10,
        debug: false,
      });

      try {
        await client.execute({
          feedIds: ['1'],
          abi: testAbi,
          functionName: 'update',
          args: [1n],
          to: '0x0000000000000000000000000000000000000001',
          chainAdapter: adapter,
        });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
        expect((e as PullOracleConsumerValidationError).code).toBe('FEED_EXPIRED');
      }

      expect(adapter.sendTransaction).not.toHaveBeenCalled();
    });

    it('passes value parameter to chainAdapter', async () => {
      const now = Math.floor(Date.now() / 1000);
      const extraData = buildMockExtraData(now);
      mockFetch.mockResolvedValue(makeMockResponse(extraData));
      const adapter = createMockChainAdapter();

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
        debug: false,
      });

      await client.execute({
        feedIds: ['1'],
        abi: testAbi,
        functionName: 'update',
        args: [1n],
        to: '0x0000000000000000000000000000000000000001',
        value: 1000000000000000000n,
        chainAdapter: adapter,
      });

      expect(adapter.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 1000000000000000000n,
        }),
      );
    });

    it('propagates transport errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      const adapter = createMockChainAdapter();

      const client = new PullOracleConsumerClient({
        http: { apiKey: 'key' },
        validate: false,
        debug: false,
      });

      await expect(
        client.execute({
          feedIds: ['1'],
          abi: testAbi,
          functionName: 'update',
          args: [1n],
          to: '0x0000000000000000000000000000000000000001',
          chainAdapter: adapter,
        }),
      ).rejects.toThrow(PullOracleConsumerTransportError);

      expect(adapter.sendTransaction).not.toHaveBeenCalled();
    });
  });
});
