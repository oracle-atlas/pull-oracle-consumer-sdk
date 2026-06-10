import type { Hex } from './types.js';

export function hexToBytes(hex: Hex): Uint8Array {
  const stripped = hex.slice(2);
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let hex = '0x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex as Hex;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

export function bytesToNumber(bytes: Uint8Array): number {
  return Number(bytesToBigInt(bytes));
}

export function concatHex(...hexes: Hex[]): Hex {
  return ('0x' + hexes.map((h) => h.slice(2)).join('')) as Hex;
}
