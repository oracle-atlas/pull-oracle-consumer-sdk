export type ValidationErrorCode =
  | 'EMPTY_FEED_IDS'
  | 'DUPLICATE_FEED_IDS'
  | 'EMPTY_EXTRA_DATA'
  | 'EXCEEDS_MAX_PACKAGE_COUNT'
  | 'FEED_EXPIRED'
  | 'FEED_FUTURE_DRIFT'
  | 'INVALID_EXTRA_DATA'
  | 'INVALID_MAGIC_MARKER'; 

export class PullOracleConsumerValidationError extends Error {
  readonly code: ValidationErrorCode;
  readonly feedId?: string;

  constructor(code: ValidationErrorCode, message: string, feedId?: string) {
    super(message);
    this.name = 'PullOracleConsumerValidationError';
    this.code = code;
    this.feedId = feedId;
  }
}

export class PullOracleConsumerTransportError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message, { cause });
    this.name = 'PullOracleConsumerTransportError';
    this.statusCode = statusCode;
  }
}
