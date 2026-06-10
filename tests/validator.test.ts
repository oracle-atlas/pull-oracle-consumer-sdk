import { describe, it, expect, vi, afterEach } from 'vitest';
import { validatePriceData } from '../src/validator.js';
import { PullOracleConsumerValidationError } from '../src/errors.js';
import type { Hex } from '../src/types.js';

const DUMMY_SIG = '00'.repeat(65);
const MAGIC = '7096';

function buildExtraData(packages: { feedId: number; value: bigint; timestamp: number }[]): Hex {
  let payload = '';
  for (const pkg of packages) {
    payload += pkg.feedId.toString(16).padStart(8, '0');
    payload += pkg.value.toString(16).padStart(20, '0');
    payload += pkg.timestamp.toString(16).padStart(12, '0');
  }
  const count = packages.length.toString(16).padStart(2, '0');
  return ('0x' + payload + count + DUMMY_SIG + MAGIC) as Hex;
}

const defaultConfig = {
  maxDelay: 300,
  maxFutureDrift: 60,
  maxPackageCount: 10,
};

describe('validatePriceData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns packages when validation passes', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 1, value: 1000000000000000000n, timestamp: now },
    ]);

    const result = validatePriceData(extraData, defaultConfig);
    expect(result).toHaveLength(1);
    expect(result[0].feedId).toBe('1');
  });

  it('throws EXCEEDS_MAX_PACKAGE_COUNT when too many packages', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 1, value: 1n, timestamp: now },
      { feedId: 2, value: 1n, timestamp: now },
      { feedId: 3, value: 1n, timestamp: now },
    ]);

    expect(() => validatePriceData(extraData, { ...defaultConfig, maxPackageCount: 2 })).toThrow(
      expect.objectContaining({
        code: 'EXCEEDS_MAX_PACKAGE_COUNT',
      }),
    );
  });

  it('throws FEED_EXPIRED when timestamp too old', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 42, value: 1n, timestamp: now - 400 },
    ]);

    try {
      validatePriceData(extraData, defaultConfig);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
      const err = e as PullOracleConsumerValidationError;
      expect(err.code).toBe('FEED_EXPIRED');
      expect(err.feedId).toBe('42');
    }
  });

  it('throws FEED_FUTURE_DRIFT when timestamp too far in future', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 99, value: 1n, timestamp: now + 120 },
    ]);

    try {
      validatePriceData(extraData, defaultConfig);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
      const err = e as PullOracleConsumerValidationError;
      expect(err.code).toBe('FEED_FUTURE_DRIFT');
      expect(err.feedId).toBe('99');
    }
  });

  it('throws EXCEEDS_MAX_PACKAGE_COUNT before FEED_EXPIRED when both apply', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 1, value: 1n, timestamp: now - 400 },
      { feedId: 2, value: 1n, timestamp: now - 400 },
      { feedId: 3, value: 1n, timestamp: now - 400 },
    ]);

    try {
      validatePriceData(extraData, { ...defaultConfig, maxPackageCount: 2 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
      expect((e as PullOracleConsumerValidationError).code).toBe('EXCEEDS_MAX_PACKAGE_COUNT');
    }
  });

  it('throws FEED_EXPIRED before FEED_FUTURE_DRIFT when both apply', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 1, value: 1n, timestamp: now - 400 },
      { feedId: 2, value: 1n, timestamp: now + 120 },
    ]);

    try {
      validatePriceData(extraData, defaultConfig);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
      expect((e as PullOracleConsumerValidationError).code).toBe('FEED_EXPIRED');
    }
  });

  it('reports feedId of the expired package when multiple packages present', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 10, value: 1n, timestamp: now },
      { feedId: 20, value: 1n, timestamp: now - 400 },
    ]);

    try {
      validatePriceData(extraData, defaultConfig);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PullOracleConsumerValidationError);
      const err = e as PullOracleConsumerValidationError;
      expect(err.code).toBe('FEED_EXPIRED');
      expect(err.feedId).toBe('20');
    }
  });

  it('returns all packages when multiple are valid', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 1, value: 1000000000000000000n, timestamp: now },
      { feedId: 2, value: 2000000000000000000n, timestamp: now - 10 },
      { feedId: 3, value: 3000000000000000000n, timestamp: now + 5 },
    ]);

    const result = validatePriceData(extraData, defaultConfig);
    expect(result).toHaveLength(3);
  });

  it('passes validation with count=0 (empty packages)', () => {
    const extraData = buildExtraData([]);
    const result = validatePriceData(extraData, defaultConfig);
    expect(result).toHaveLength(0);
  });

  it('does not throw when timestamp is exactly at boundary', () => {
    const now = Math.floor(Date.now() / 1000);
    const extraData = buildExtraData([
      { feedId: 1, value: 1n, timestamp: now - 300 },
      { feedId: 2, value: 1n, timestamp: now + 60 },
    ]);

    const result = validatePriceData(extraData, defaultConfig);
    expect(result).toHaveLength(2);
  });
});
