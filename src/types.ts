export type Hex = `0x${string}`;

export interface FeedPackage {
  feedId: string;
  price: string;
  timestamp: number;
}

export interface PriceData {
  extraData: Hex;
}

export interface ChainAdapter {
  sendTransaction(params: {
    to: Hex;
    data: Hex;
    value?: bigint;
  }): Promise<Hex>;
}

export type FeedType = 'public' | 'private';

export interface HttpTransportConfig {
  apiKey: string;
  timeout?: number;
}

export interface WsTransportConfigWithReconnect {
  apiKey: string;
  reconnect: true;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  pingInterval: number;
}

export interface WsTransportConfigWithoutReconnect {
  apiKey: string;
  reconnect: false;
}

export type WsTransportConfig = WsTransportConfigWithReconnect | WsTransportConfigWithoutReconnect;

interface ValidationEnabled {
  validate: true;
  maxDelay: number;
  maxFutureDrift: number;
  maxPackageCount: number;
}

interface ValidationDisabled {
  validate: false;
}

type ValidationConfig = ValidationEnabled | ValidationDisabled;

interface ClientBaseConfig {
  http: HttpTransportConfig;
  ws?: WsTransportConfig;
  debug?: boolean;
}

export type PullOracleConsumerClientConfig = ClientBaseConfig & ValidationConfig;
