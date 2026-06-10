import { describe, it, expect } from 'vitest';
import {
  PullOracleConsumerValidationError,
  PullOracleConsumerTransportError,
} from '../src/errors.js';

describe('PullOracleConsumerValidationError', () => {
  it('sets name, code, and message', () => {
    const err = new PullOracleConsumerValidationError('FEED_EXPIRED', 'Feed is expired');
    expect(err.name).toBe('PullOracleConsumerValidationError');
    expect(err.code).toBe('FEED_EXPIRED');
    expect(err.message).toBe('Feed is expired');
  });

  it('includes feedId when provided', () => {
    const err = new PullOracleConsumerValidationError('FEED_EXPIRED', 'expired', '42');
    expect(err.feedId).toBe('42');
  });

  it('feedId is undefined when not provided', () => {
    const err = new PullOracleConsumerValidationError('EMPTY_FEED_IDS', 'empty');
    expect(err.feedId).toBeUndefined();
  });

  it('is instance of Error', () => {
    const err = new PullOracleConsumerValidationError('EMPTY_FEED_IDS', 'empty');
    expect(err).toBeInstanceOf(Error);
  });

  it('supports all validation error codes', () => {
    const codes = [
      'EMPTY_FEED_IDS',
      'EXCEEDS_MAX_PACKAGE_COUNT',
      'FEED_EXPIRED',
      'FEED_FUTURE_DRIFT',
    ] as const;
    for (const code of codes) {
      const err = new PullOracleConsumerValidationError(code, `test ${code}`);
      expect(err.code).toBe(code);
    }
  });
});

describe('PullOracleConsumerTransportError', () => {
  it('sets name, statusCode, and message', () => {
    const err = new PullOracleConsumerTransportError('HTTP 401', 401);
    expect(err.name).toBe('PullOracleConsumerTransportError');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('HTTP 401');
  });

  it('includes cause when provided', () => {
    const cause = new TypeError('fetch failed');
    const err = new PullOracleConsumerTransportError('Network error', undefined, cause);
    expect(err.cause).toBe(cause);
  });

  it('statusCode is undefined and cause is undefined when not provided', () => {
    const err = new PullOracleConsumerTransportError('generic error');
    expect(err.statusCode).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('is instance of Error', () => {
    const err = new PullOracleConsumerTransportError('error');
    expect(err).toBeInstanceOf(Error);
  });
});
