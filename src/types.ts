import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ── Enums ──────────────────────────────────────────────────────────────────

export enum Side {
  Bid = 0, // wants to BUY base token, pays quote
  Ask = 1, // wants to SELL base token, receives quote
}

export enum OrderType {
  Limit    = 0, // rests in book until filled, cancelled, or expired
  IOC      = 1, // fill what's possible now, cancel the rest
  FOK      = 2, // fill all or cancel entirely
  PostOnly = 3, // only accepted if it doesn't immediately cross
}

// ── Account layouts ────────────────────────────────────────────────────────

/**
 * On-chain Market account.
 * PDA seeds: ["market", baseMint, quoteMint]
 */
export interface Market {
  /** 8-byte discriminator */
  discriminator : Buffer;
  baseMint      : PublicKey;
  quoteMint     : PublicKey;
  /** PDA token account holding escrowed base tokens */
  baseVault     : PublicKey;
  /** PDA token account holding escrowed quote tokens */
  quoteVault    : PublicKey;
  /** Can update fee_bps */
  authority     : PublicKey;
  /** Minimum price increment in raw quote token units */
  tickSize      : BN;
  /** Minimum order size in raw base token units */
  lotSize       : BN;
  /** Protocol fee in basis points (e.g. 20 = 0.20%) */
  feeBps           : number;
  bump             : number;
  baseVaultBump    : number;
  quoteVaultBump   : number;
}

/**
 * On-chain Order account.
 * PDA seeds: ["order", market, owner, orderId (8 bytes LE)]
 */
export interface Order {
  discriminator : Buffer;
  market        : PublicKey;
  owner         : PublicKey;
  /** Price in tick_size units */
  price         : BN;
  /** Original quantity in lot_size units */
  origQty       : BN;
  /** How much has been filled so far */
  filledQty     : BN;
  /** Unix timestamp expiry (0 = no expiry) */
  expiry        : BN;
  createdAt     : BN;
  side          : Side;
  orderType     : OrderType;
  bump          : number;
}

// ── Instruction param types ────────────────────────────────────────────────

export interface CreateMarketParams {
  /** Who pays rent and becomes the market authority */
  payer     : PublicKey;
  baseMint  : PublicKey;
  quoteMint : PublicKey;
  tickSize  : BN;
  lotSize   : BN;
  /** Basis points, e.g. 20 = 0.20% */
  feeBps    : number;
}

export interface PlaceOrderParams {
  owner      : PublicKey;
  market     : PublicKey;
  /** client-chosen unique ID — part of the order PDA seeds */
  orderId    : BN;
  side       : Side;
  orderType  : OrderType;
  price      : BN;
  qty        : BN;
  /** Unix timestamp; 0 = no expiry */
  expiry     : BN;
  /** owner's token account to debit (quote if Bid, base if Ask) */
  ownerToken : PublicKey;
}

export interface FillOrderParams {
  taker        : PublicKey;
  order        : PublicKey;
  market       : PublicKey;
  fillQty      : BN;
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

// ── Event types ────────────────────────────────────────────────────────────

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
  type       : "OrderFilled";
  market     : PublicKey;
  order      : PublicKey;
  maker      : PublicKey;
  taker      : PublicKey;
  fillPrice  : BN;
  fillQty    : BN;
  timestamp  : BN;
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
