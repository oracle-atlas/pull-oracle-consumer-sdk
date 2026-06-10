import type { Hex, FeedPackage } from './types.js';
import { parseExtraData } from './parser.js';
import { PullOracleConsumerValidationError } from './errors.js';

export interface ValidateConfig {
  maxDelay: number;
  maxFutureDrift: number;
  maxPackageCount: number;
}

export function validatePriceData(extraData: Hex, config: ValidateConfig): FeedPackage[] {
  const { packages } = parseExtraData(extraData);

  if (packages.length > config.maxPackageCount) {
    throw new PullOracleConsumerValidationError(
      'EXCEEDS_MAX_PACKAGE_COUNT',
      `Package count ${packages.length} exceeds max ${config.maxPackageCount}`,
    );
  }

  const now = Math.floor(Date.now() / 1000);

  for (const pkg of packages) {
    if (pkg.timestamp < now - config.maxDelay) {
      throw new PullOracleConsumerValidationError(
        'FEED_EXPIRED',
        `Feed ${pkg.feedId} expired: timestamp ${pkg.timestamp} is older than ${config.maxDelay}s`,
        pkg.feedId,
      );
    }
  }

  for (const pkg of packages) {
    if (pkg.timestamp > now + config.maxFutureDrift) {
      throw new PullOracleConsumerValidationError(
        'FEED_FUTURE_DRIFT',
        `Feed ${pkg.feedId} timestamp ${pkg.timestamp} is too far in the future`,
        pkg.feedId,
      );
    }
  }

  return packages;
}
