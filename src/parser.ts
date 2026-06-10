import type { Hex, FeedPackage } from './types.js';
import { hexToBytes, bytesToBigInt, bytesToNumber, bytesToHex } from './utils.js';
import { PullOracleConsumerValidationError } from './errors.js';

const MAGIC_MARKER = 0x7096;
const MAGIC_MARKER_SIZE = 2;
const SIGNATURE_SIZE = 65;
const COUNT_SIZE = 1;
const PACKAGE_SIZE = 20;
const FEED_ID_SIZE = 4;
const VALUE_SIZE = 10;
const TIMESTAMP_SIZE = 6;
const VALUE_DECIMALS = 18n;
const VALUE_DIVISOR = 10n ** VALUE_DECIMALS;

export function assembleExtraData(payload: string, signature: string, magicMarker: string): Hex {
  const strip0x = (s: string) => (s.startsWith('0x') ? s.slice(2) : s);
  return ('0x' + strip0x(payload) + strip0x(signature) + strip0x(magicMarker)) as Hex;
}

export interface ParsedExtraData {
  packages: FeedPackage[];
  count: number;
  signature: Hex;
  magicMarker: Hex;
}

export function parseExtraData(extraData: Hex): ParsedExtraData {
  const bytes = hexToBytes(extraData);
  if (bytes.length < MAGIC_MARKER_SIZE + SIGNATURE_SIZE + COUNT_SIZE) {
    throw new PullOracleConsumerValidationError(
      'INVALID_EXTRA_DATA',
      'extraData too short to parse',
    );
  }

  let offset = bytes.length;

  offset -= MAGIC_MARKER_SIZE;
  const marker = bytesToNumber(bytes.slice(offset, offset + MAGIC_MARKER_SIZE));
  if (marker !== MAGIC_MARKER) {
    throw new PullOracleConsumerValidationError(
      'INVALID_MAGIC_MARKER',
      `Invalid magic marker: 0x${marker.toString(16)}, expected ${MAGIC_MARKER}`,
    );
  }
  const magicMarkerHex = bytesToHex(bytes.slice(offset, offset + MAGIC_MARKER_SIZE));

  offset -= SIGNATURE_SIZE;
  const signatureHex = bytesToHex(bytes.slice(offset, offset + SIGNATURE_SIZE));

  offset -= COUNT_SIZE;
  const count = bytes[offset];

  if (offset < count * PACKAGE_SIZE) {
    throw new PullOracleConsumerValidationError(
      'INVALID_EXTRA_DATA',
      `extraData too short: expected ${count} packages but only have space for ${Math.floor(offset / PACKAGE_SIZE)}`,
    );
  }

  const packages: FeedPackage[] = [];
  for (let i = 0; i < count; i++) {
    offset -= PACKAGE_SIZE;
    const pkg = bytes.slice(offset, offset + PACKAGE_SIZE);

    const feedId = bytesToNumber(pkg.slice(0, FEED_ID_SIZE)).toString();
    const rawValue = bytesToBigInt(pkg.slice(FEED_ID_SIZE, FEED_ID_SIZE + VALUE_SIZE));
    const price = formatPrice(rawValue);
    const timestamp = bytesToNumber(
      pkg.slice(FEED_ID_SIZE + VALUE_SIZE, FEED_ID_SIZE + VALUE_SIZE + TIMESTAMP_SIZE),
    );

    packages.push({ feedId, price, timestamp });
  }

  return { packages, count, signature: signatureHex, magicMarker: magicMarkerHex };
}

function formatPrice(raw: bigint): string {
  const integer = raw / VALUE_DIVISOR;
  const fraction = raw % VALUE_DIVISOR;
  if (fraction === 0n) return integer.toString();
  const fractionStr = fraction.toString().padStart(Number(VALUE_DECIMALS), '0').replace(/0+$/, '');
  return `${integer}.${fractionStr}`;
}
