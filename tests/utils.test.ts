import { describe, it, expect } from 'vitest';
import { hexToBytes, bytesToHex, bytesToBigInt, bytesToNumber, concatHex } from '../src/utils.js';

describe('hexToBytes', () => {
  it('converts hex string to bytes', () => {
    expect(hexToBytes('0xff')).toEqual(new Uint8Array([255]));
    expect(hexToBytes('0x0102')).toEqual(new Uint8Array([1, 2]));
  });

  it('handles empty hex', () => {
    expect(hexToBytes('0x')).toEqual(new Uint8Array([]));
  });

  it('handles zero bytes', () => {
    expect(hexToBytes('0x0000')).toEqual(new Uint8Array([0, 0]));
  });
});

describe('bytesToHex', () => {
  it('converts bytes to hex string', () => {
    expect(bytesToHex(new Uint8Array([255]))).toBe('0xff');
    expect(bytesToHex(new Uint8Array([1, 2]))).toBe('0x0102');
  });

  it('handles empty bytes', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('0x');
  });

  it('pads single digit values', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 10]))).toBe('0x00010a');
  });
});

describe('bytesToBigInt', () => {
  it('converts bytes to bigint', () => {
    expect(bytesToBigInt(new Uint8Array([1]))).toBe(1n);
    expect(bytesToBigInt(new Uint8Array([1, 0]))).toBe(256n);
    expect(bytesToBigInt(new Uint8Array([0xff, 0xff]))).toBe(65535n);
  });

  it('handles empty bytes', () => {
    expect(bytesToBigInt(new Uint8Array([]))).toBe(0n);
  });
});

describe('bytesToNumber', () => {
  it('converts bytes to number', () => {
    expect(bytesToNumber(new Uint8Array([1]))).toBe(1);
    expect(bytesToNumber(new Uint8Array([1, 0]))).toBe(256);
  });
});

describe('concatHex', () => {
  it('concatenates multiple hex values', () => {
    expect(concatHex('0xaa', '0xbb', '0xcc')).toBe('0xaabbcc');
  });

  it('handles two values', () => {
    expect(concatHex('0x0102', '0x0304')).toBe('0x01020304');
  });

  it('handles single value', () => {
    expect(concatHex('0xabcd')).toBe('0xabcd');
  });
});
