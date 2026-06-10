import { encodeFunctionData, type Abi } from 'viem';
import type { Hex } from './types.js';
import { concatHex } from './utils.js';
import { PullOracleConsumerValidationError } from './errors.js';

export interface BuildCalldataParams {
  abi: Abi;
  functionName: string;
  args: unknown[];
  extraData: Hex;
}

export function buildCalldata(params: BuildCalldataParams): Hex {
  if (!params.extraData || params.extraData === '0x') {
    throw new PullOracleConsumerValidationError(
      'EMPTY_EXTRA_DATA',
      'extraData must not be empty',
    );
  }

  const encoded = encodeFunctionData({
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
  });
  return concatHex(encoded as Hex, params.extraData);
}
