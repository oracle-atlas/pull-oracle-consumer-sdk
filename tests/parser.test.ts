import { describe, it, expect } from 'vitest';
import { assembleExtraData, parseExtraData } from '../src/parser.js';

describe('assembleExtraData', () => {
  it('assembles payload + signature + magicMarker with 0x prefixes', () => {
    const result = assembleExtraData('0xaabb', '0xccdd', '0xeeff');
    expect(result).toBe('0xaabbccddeeff');
  });

  it('handles fields without 0x prefix', () => {
    const result = assembleExtraData('aabb', 'ccdd', 'eeff');
    expect(result).toBe('0xaabbccddeeff');
  });

  it('handles mixed 0x prefix', () => {
    const result = assembleExtraData('0xaa', 'bb', '0xcc');
    expect(result).toBe('0xaabbcc');
  });
});

describe('parseExtraData', () => {
  it('parses backend example with 2 packages', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    const fullExtraData = ('0x' +
      '00000cfb0000004ff8b9c9e4e000000069b37505' +
      '00000cfd0000002a8fbf1c68c000000069b37505' +
      '02' +
      dummySig +
      magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);

    expect(result.count).toBe(2);
    expect(result.magicMarker).toBe('0x7096');
    expect(result.packages).toHaveLength(2);

    // Packages are parsed in reverse order (from tail)
    // Second package in binary = first parsed
    const pkg1 = result.packages.find((p) => p.feedId === '3325');
    const pkg2 = result.packages.find((p) => p.feedId === '3323');

    expect(pkg1).toBeDefined();
    expect(pkg1!.timestamp).toBe(1773368581);

    expect(pkg2).toBeDefined();
    expect(pkg2!.timestamp).toBe(1773368581);
  });

  it('parses single package', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    // feedId=1 (4B), value=1e18 (10B) = 0x00000de0b6b3a7640000, timestamp=100 (6B) = 0x000000000064
    const pkg = '00000001' + '00000de0b6b3a7640000' + '000000000064';
    const fullExtraData = ('0x' + pkg + '01' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);

    expect(result.count).toBe(1);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].feedId).toBe('1');
    expect(result.packages[0].price).toBe('1');
    expect(result.packages[0].timestamp).toBe(100);
  });

  it('throws on extraData too short', () => {
    expect(() => parseExtraData('0x0102')).toThrow('extraData too short');
  });

  it('throws on invalid magic marker', () => {
    const dummySig = '00'.repeat(65);
    const badMarker = 'ffff';
    const pkg = '00000001' + '00000de0b6b3a7640000' + '000000000064';
    const fullExtraData = ('0x' + pkg + '01' + dummySig + badMarker) as `0x${string}`;

    expect(() => parseExtraData(fullExtraData)).toThrow('Invalid magic marker');
  });

  it('parses extraData with count=0 (empty packages)', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    const fullExtraData = ('0x' + '00' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);
    expect(result.count).toBe(0);
    expect(result.packages).toHaveLength(0);
  });

  it('parses 3 packages', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    const now = 1773368581;
    const tsHex = now.toString(16).padStart(12, '0');
    const pkg1 = '00000001' + '00000de0b6b3a7640000' + tsHex;
    const pkg2 = '00000002' + '00000de0b6b3a7640000' + tsHex;
    const pkg3 = '00000003' + '00000de0b6b3a7640000' + tsHex;
    const fullExtraData = ('0x' + pkg1 + pkg2 + pkg3 + '03' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);
    expect(result.count).toBe(3);
    expect(result.packages).toHaveLength(3);
    const feedIds = result.packages.map((p) => p.feedId).sort();
    expect(feedIds).toEqual(['1', '2', '3']);
  });

  it('formats price = 0', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    const pkg = '00000001' + '00000000000000000000' + '000000000064';
    const fullExtraData = ('0x' + pkg + '01' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);
    expect(result.packages[0].price).toBe('0');
  });

  it('formats pure fractional price (integer part = 0)', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    // value = 100000000000000 = 0.0001 ETH (10^14)
    const valueHex = '000000005af3107a4000';
    const pkg = '00000001' + valueHex + '000000000064';
    const fullExtraData = ('0x' + pkg + '01' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);
    expect(result.packages[0].price).toMatch(/^0\.\d+/);
    expect(Number(result.packages[0].price)).toBeGreaterThan(0);
    expect(Number(result.packages[0].price)).toBeLessThan(1);
  });

  it('formats large price correctly', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    // value = 50000 * 10^18 = 50000 ETH
    const rawValue = 50000n * 10n ** 18n;
    const valueHex = rawValue.toString(16).padStart(20, '0');
    const pkg = '00000001' + valueHex + '000000000064';
    const fullExtraData = ('0x' + pkg + '01' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);
    expect(result.packages[0].price).toBe('50000');
  });

  it('formats price with decimals correctly', () => {
    const dummySig = '00'.repeat(65);
    const magicMarker = '7096';
    // value = 22510000000000000 = 0x00000000004ff8b9c9e4e000 (10 bytes)
    // That's 0.02251 ETH
    const feedIdHex = '00000cfb'; // 3323
    const valueHex = '0000004ff8b9c9e4e000'; // 22510000000000000
    const tsHex = '000069b37505'; // 1773368581
    const pkg = feedIdHex + valueHex + tsHex;
    const fullExtraData = ('0x' + pkg + '01' + dummySig + magicMarker) as `0x${string}`;

    const result = parseExtraData(fullExtraData);
    expect(result.packages[0].price).toBe('0.02251');
  });
});
