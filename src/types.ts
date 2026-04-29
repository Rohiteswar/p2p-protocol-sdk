import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export enum Side {
  Bid = 0,
  Ask = 1,
}

export enum OrderType {
  Limit    = 0,
  IOC      = 1,
  FOK      = 2,
  PostOnly = 3,
}

export interface Market {
  discriminator  : Buffer;
  baseMint       : PublicKey;
  quoteMint      : PublicKey;
  baseVault      : PublicKey;
  quoteVault     : PublicKey;
  authority      : PublicKey;
  tickSize       : BN;
  lotSize        : BN;
  feeBps         : number;
  bump           : number;
  baseVaultBump  : number;
  quoteVaultBump : number;
}

export interface Order {
  discriminator : Buffer;
  market        : PublicKey;
  owner         : PublicKey;
  price         : BN;
  origQty       : BN;
  filledQty     : BN;
  expiry        : BN;
  createdAt     : BN;
  side          : Side;
  orderType     : OrderType;
  bump          : number;
}

export interface CreateMarketParams {
  payer     : PublicKey;
  baseMint  : PublicKey;
  quoteMint : PublicKey;
  tickSize  : BN;
  lotSize   : BN;
  feeBps    : number;
}

export interface PlaceOrderParams {
  owner      : PublicKey;
  market     : PublicKey;
  orderId    : BN;
  side       : Side;
  orderType  : OrderType;
  price      : BN;
  qty        : BN;
  expiry     : BN;
  ownerToken : PublicKey;
}

export interface FillOrderParams {
  taker         : PublicKey;
  order         : PublicKey;
  market        : PublicKey;
  fillQty       : BN;
  takerBaseAta  : PublicKey;
  takerQuoteAta : PublicKey;
  makerBaseAta  : PublicKey;
  makerQuoteAta : PublicKey;
}

export interface CancelOrderParams {
  owner      : PublicKey;
  order      : PublicKey;
  market     : PublicKey;
  ownerToken : PublicKey;
}

export interface ExpireOrderParams {
  caller     : PublicKey;
  order      : PublicKey;
  market     : PublicKey;
  owner      : PublicKey;
  ownerToken : PublicKey;
}

export interface MarketCreatedEvent {
  type      : "MarketCreated";
  market    : PublicKey;
  baseMint  : PublicKey;
  quoteMint : PublicKey;
  tickSize  : BN;
  lotSize   : BN;
  feeBps    : number;
  timestamp : BN;
}

export interface OrderPlacedEvent {
  type      : "OrderPlaced";
  market    : PublicKey;
  order     : PublicKey;
  owner     : PublicKey;
  side      : Side;
  orderType : OrderType;
  price     : BN;
  qty       : BN;
  expiry    : BN;
  createdAt : BN;
}

export interface OrderFilledEvent {
  type      : "OrderFilled";
  market    : PublicKey;
  order     : PublicKey;
  maker     : PublicKey;
  taker     : PublicKey;
  fillPrice : BN;
  fillQty   : BN;
  timestamp : BN;
}

export interface OrderCancelledEvent {
  type      : "OrderCancelled";
  market    : PublicKey;
  order     : PublicKey;
  owner     : PublicKey;
  timestamp : BN;
}

export interface OrderExpiredEvent {
  type      : "OrderExpired";
  market    : PublicKey;
  order     : PublicKey;
  owner     : PublicKey;
  timestamp : BN;
}

export type P2PEvent =
  | MarketCreatedEvent
  | OrderPlacedEvent
  | OrderFilledEvent
  | OrderCancelledEvent
  | OrderExpiredEvent;
