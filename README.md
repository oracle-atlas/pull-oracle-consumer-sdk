# @atlas-oracle/pull-oracle-consumer-sdk

TypeScript SDK for fetching signed Pull Oracle price data, validating payloads, building contract calldata, and submitting on-chain update transactions through a user-provided chain adapter.

## What This SDK Does

- Fetch signed price data over HTTP.
- Optionally validate payload freshness and package constraints before use.
- Build calldata by encoding your contract call and appending oracle `extraData`.
- Subscribe to real-time price updates over WebSocket.
- Submit transactions through a user-supplied `ChainAdapter`.

## Scope

This SDK is intentionally focused on price data consumption and transaction preparation. It does not:

- Manage wallets, private keys, signers, or seed phrases.
- Replace `ethers`, `viem`, or another chain library.
- Abstract full transaction orchestration such as nonce management, gas strategy, batching, or retries.
- Handle backend credential storage or secret-management workflows for API keys.

## Installation

```bash
npm install @atlas-oracle/pull-oracle-consumer-sdk
```

If you plan to use WebSocket subscriptions in Node.js, install `ws` alongside the SDK:

```bash
npm install ws
```

`ws` provides the Node.js WebSocket implementation used by the SDK for subscriptions. In some Node.js environments, installing it can also avoid module-loading issues even if you currently only use HTTP.

## Compatibility

- Node.js >= 18
- ESM and CommonJS supported
- WebSocket subscriptions in Node.js require `ws`
- Some Node.js environments may also require `ws` during module resolution, even for HTTP-only usage
- Support outside Node.js is not guaranteed; validate your target runtime, especially its WebSocket implementation

## Quick Start

### Fetch price data

```typescript
import { PullOracleConsumerClient } from '@atlas-oracle/pull-oracle-consumer-sdk';

const client = new PullOracleConsumerClient({
  http: {
    apiKey: 'YOUR_API_KEY',
  },
  validate: false,
});

const priceData = await client.fetchPrices(['3323', '3325']);

console.log(priceData.extraData);
```

### Execute an on-chain update

```typescript
import {
  PullOracleConsumerClient,
  type ChainAdapter,
  type Hex,
} from '@atlas-oracle/pull-oracle-consumer-sdk';

const client = new PullOracleConsumerClient({
  http: {
    apiKey: 'YOUR_API_KEY',
  },
  validate: true,
  maxDelay: 60,
  maxFutureDrift: 5,
  maxPackageCount: 10,
});

const chainAdapter: ChainAdapter = {
  async sendTransaction({ to, data, value }) {
    const tx = await signer.sendTransaction({
      to,
      data,
      value: value ?? 0n,
    });

    return tx.hash as Hex;
  },
};

const txHash = await client.execute({
  feedIds: ['3323'],
  abi: contractAbi,
  functionName: 'updatePrice',
  args: [3323n],
  to: '0xContractAddress' as Hex,
  chainAdapter,
});

console.log(txHash);
```

## API Overview

Main entry point:

- `PullOracleConsumerClient` — configures HTTP access, optional WebSocket transport, validation, and debug behavior.

Core methods:

- `fetchPrices(feedIds)` — fetch signed price data for one or more feeds.
- `buildCalldata(params)` — encode a contract function call and append oracle `extraData`.
- `sendTransaction(params)` — delegate a prepared transaction to your `ChainAdapter`.
- `execute(params)` — fetch prices, build calldata, and send the transaction in one call.
- `subscribe(feedIds, feedType, onUpdate, onError?)` — receive live price updates over WebSocket.

Also exported:

- `ChainAdapter`, `PriceData`, `Hex`, and related config types.
- `PullOracleConsumerValidationError` and `PullOracleConsumerTransportError`.

## API Reference

### `new PullOracleConsumerClient(config)`

Creates a new client instance.

#### HTTP configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `http.apiKey` | `string` | Yes | API key used for authenticated HTTP requests. |
| `http.timeout` | `number` | No | Request timeout in milliseconds. Default: `10000`. |

#### WebSocket configuration

Provide `ws` configuration when you plan to call `subscribe`. In Node.js, install the `ws` package so the SDK has a compatible WebSocket implementation available. In some environments, installing `ws` may also help avoid module-loading issues even before you start using subscriptions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ws.apiKey` | `string` | Yes, when `ws` is provided | API key used for authenticated WebSocket connections. |
| `ws.reconnect` | `boolean` | Yes, when `ws` is provided | Enables or disables automatic reconnection. |
| `ws.reconnectInterval` | `number` | Required when `ws.reconnect: true` | Delay between reconnect attempts in milliseconds. |
| `ws.maxReconnectAttempts` | `number` | Required when `ws.reconnect: true` | Maximum reconnect attempts before surfacing an error. |
| `ws.pingInterval` | `number` | Required when `ws.reconnect: true` | Ping interval in milliseconds for keepalive behavior. |

#### Validation configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `validate` | `boolean` | Yes | Enables or disables validation of returned oracle payloads. |
| `maxDelay` | `number` | Required when `validate: true` | Maximum allowed payload staleness in seconds. |
| `maxFutureDrift` | `number` | Required when `validate: true` | Maximum allowed future timestamp drift in seconds. |
| `maxPackageCount` | `number` | Required when `validate: true` | Maximum number of packages allowed in a response. |

#### Debug configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `debug` | `boolean` | No | Logs parsed payload details for debugging. Default: `false`. |

### `client.fetchPrices(feedIds)`

When to use: Use this when you need signed price data and want to decide yourself how to validate, encode, or submit the resulting data.

Fetch signed price data via HTTP. `feedIds` must be a non-empty array with no duplicates.

```typescript
const priceData = await client.fetchPrices(['3323', '3325']);
// priceData.extraData is ready to append to an on-chain call
```

### `client.buildCalldata(params)`

When to use: Use this when you already have `extraData` and need transaction calldata for a contract call.

Build transaction calldata by encoding a function call and appending `extraData`.

```typescript
const calldata = client.buildCalldata({
  abi: contractAbi,
  functionName: 'updatePrice',
  args: [3323n],
  extraData: priceData.extraData,
});
```

### `client.sendTransaction(params)`

When to use: Use this when your application already prepared the transaction payload and just wants the SDK to hand it to your adapter.

Send a transaction via a `ChainAdapter`.

```typescript
const txHash = await client.sendTransaction({
  to: '0xContractAddress',
  data: calldata,
  chainAdapter: myAdapter,
});
```

### `client.execute(params)`

When to use: Use this when you want one helper that fetches prices, builds calldata, and submits the update transaction.

One-step helper: fetch prices, build calldata, and send the transaction.

```typescript
const txHash = await client.execute({
  feedIds: ['3323'],
  abi: contractAbi,
  functionName: 'updatePrice',
  args: [3323n],
  to: '0xContractAddress',
  chainAdapter: myAdapter,
});
```

### `client.subscribe(feedIds, feedType, onUpdate, onError?)`

When to use: Use this when you need live updates over WebSocket instead of polling HTTP.

Subscribe to real-time price updates via WebSocket. This requires `ws` configuration on the client. In Node.js, install the `ws` package when you plan to use subscriptions so the SDK can use a compatible WebSocket implementation.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `feedIds` | `string[]` | Yes | Non-empty array of feed ID strings with no duplicates. |
| `feedType` | `'public' \| 'private'` | Yes | Feed type: `'public'` for public feeds or `'private'` for private feeds. |
| `onUpdate` | `(data: PriceData) => void` | Yes | Callback invoked on each price update. |
| `onError` | `(err: Error) => void` | No | Callback invoked when a transport or processing error occurs. |

When `validate: true`, WebSocket data that fails validation falls back to an HTTP fetch for the same feeds.

Each call to `subscribe` creates a separate WebSocket connection and returns an unsubscribe function.

```typescript
const unsubscribe = client.subscribe(
  ['3323', '3325'],
  'public',
  (data) => {
    console.log('Price update:', data.extraData);
  },
  (err) => {
    console.error('Subscription error:', err);
  },
);

unsubscribe();
```

## ChainAdapter

The SDK does not submit transactions directly. Instead, it prepares calldata and delegates transaction submission to a user-provided `ChainAdapter`, allowing you to integrate with `ethers`, `viem`, or another signer stack.

```typescript
import type { ChainAdapter, Hex } from '@atlas-oracle/pull-oracle-consumer-sdk';
```

### ethers v6

```typescript
import { ethers } from 'ethers';

const adapter: ChainAdapter = {
  async sendTransaction({ to, data, value }) {
    const signer = await provider.getSigner();
    const tx = await signer.sendTransaction({
      to,
      data,
      value: value ?? 0n,
    });
    return tx.hash as Hex;
  },
};
```

### viem

```typescript
import { createWalletClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const walletClient = createWalletClient({
  chain: mainnet,
  transport: http(),
});

const adapter: ChainAdapter = {
  async sendTransaction({ to, data, value }) {
    return walletClient.sendTransaction({
      to,
      data,
      value: value ?? 0n,
      account: '0xYourAccount',
    });
  },
};
```

## Error Handling

The SDK primarily throws two error types:

- `PullOracleConsumerValidationError` for invalid inputs or payload validation failures.
- `PullOracleConsumerTransportError` for HTTP, WebSocket, or transport-configuration problems.

```typescript
import {
  PullOracleConsumerValidationError,
  PullOracleConsumerTransportError,
} from '@atlas-oracle/pull-oracle-consumer-sdk';

try {
  await client.fetchPrices(['3323']);
} catch (err) {
  if (err instanceof PullOracleConsumerValidationError) {
    // err.code:
    // 'EMPTY_FEED_IDS'
    // | 'DUPLICATE_FEED_IDS'
    // | 'EMPTY_EXTRA_DATA'
    // | 'EXCEEDS_MAX_PACKAGE_COUNT'
    // | 'FEED_EXPIRED'
    // | 'FEED_FUTURE_DRIFT'
    // | 'INVALID_EXTRA_DATA'
    // | 'INVALID_MAGIC_MARKER'
    // err.feedId: optional feed ID that caused the error
  }

  if (err instanceof PullOracleConsumerTransportError) {
    // err.statusCode: HTTP status code (if applicable)
    // err.cause: underlying error (standard ES2022 Error.cause)
  }
}
```

## Troubleshooting

| Problem | Likely cause | What to do |
|---------|--------------|------------|
| `WebSocket transport is not configured` | `subscribe` was called without a `ws` config block in the client constructor. | Create the client with a `ws` configuration, for example `ws: { apiKey: 'YOUR_API_KEY', reconnect: false }`. |
| `feedIds must not be empty` | `fetchPrices`, `subscribe`, or `execute` received an empty array. | Pass at least one feed ID. |
| `feedIds must not contain duplicates` | The same feed ID was provided more than once. | Deduplicate the array before calling the SDK. |
| Validation config errors when `validate: true` | `maxDelay`, `maxFutureDrift`, or `maxPackageCount` was omitted. | Provide all three validation fields whenever `validate` is set to `true`. |
| WebSocket subscriptions fail in Node.js because `ws` is missing, or the SDK does not load cleanly without it | The SDK relies on `ws` for a compatible Node.js WebSocket implementation, and some environments may also expect it during module resolution. | Install it with `npm install ws`, then retry and verify that your runtime provides the WebSocket support you expect. |

## Development

For contribution workflow and repository guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
npm install
npm run build
npm run test
npm run lint
npm run typecheck
```

### Releases

Versioning and publishing are managed by [Auto](https://intuit.github.io/auto/docs/welcome/getting-started):

```bash
npm run version:check
npm run release
```

Before publishing, replace the placeholder GitHub `owner` and `repo` values in `.autorc`, create Auto labels with `npm run labels:create`, and configure the `NPM_TOKEN` GitHub Actions secret.

## Contributing

Contributions are welcome. Please review [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Support

- For bug reports and feature requests, please open an issue.
- For security-sensitive reports, do not post sensitive details publicly in an issue. Ask the maintainers for a private contact path first if private coordination is needed.

## License

This project uses the Business Source License 1.1 (`BUSL-1.1`).
