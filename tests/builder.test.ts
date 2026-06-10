import { describe, it, expect } from 'vitest';
import { buildCalldata } from '../src/builder.js';
import { PullOracleConsumerValidationError } from '../src/errors.js';
import { encodeFunctionData } from 'viem';
import type { Hex } from '../src/types.js';

const testAbi = [
  {
    name: 'updatePrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'feedId', type: 'uint256' }],
    outputs: [],
  },
] as const;

describe('buildCalldata', () => {
  it('encodes function call and appends extraData', () => {
    const extraData: Hex = '0xdeadbeef';
    const result = buildCalldata({
      abi: testAbi,
      functionName: 'updatePrice',
      args: [3323n],
      extraData,
    });

    const encodedOnly = encodeFunctionData({
      abi: testAbi,
      functionName: 'updatePrice',
      args: [3323n],
    });

    expect(result.startsWith(encodedOnly.slice(0, 10))).toBe(true);
    expect(result.endsWith('deadbeef')).toBe(true);
    expect(result.length).toBe(encodedOnly.length + extraData.length - 2);
  });

  it('works with function that has no args', () => {
    const noArgAbi = [
      {
        name: 'ping',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
      },
    ] as const;

    const extraData: Hex = '0xdeadbeef';
    const result = buildCalldata({
      abi: noArgAbi,
      functionName: 'ping',
      args: [],
      extraData,
    });

    expect(result.startsWith('0x')).toBe(true);
    expect(result.endsWith('deadbeef')).toBe(true);
  });

  it('throws EMPTY_EXTRA_DATA when extraData is "0x"', () => {
    expect(() =>
      buildCalldata({
        abi: testAbi,
        functionName: 'updatePrice',
        args: [1n],
        extraData: '0x',
      }),
    ).toThrow(PullOracleConsumerValidationError);

    try {
      buildCalldata({ abi: testAbi, functionName: 'updatePrice', args: [1n], extraData: '0x' });
    } catch (e) {
      expect((e as PullOracleConsumerValidationError).code).toBe('EMPTY_EXTRA_DATA');
    }
  });

  it('works with multiple args', () => {
    const multiAbi = [
      {
        name: 'setValues',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'a', type: 'uint256' },
          { name: 'b', type: 'address' },
        ],
        outputs: [],
      },
    ] as const;

    const extraData: Hex = '0xaabb';
    const result = buildCalldata({
      abi: multiAbi,
      functionName: 'setValues',
      args: [1n, '0x0000000000000000000000000000000000000001'],
      extraData,
    });

    expect(result.endsWith('aabb')).toBe(true);
    expect(result.startsWith('0x')).toBe(true);
  });
});
