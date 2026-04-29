import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { EVT } from "./constants";
import {
  P2PEvent,
  MarketCreatedEvent,
  OrderPlacedEvent,
  OrderFilledEvent,
  OrderCancelledEvent,
  OrderExpiredEvent,
  Side,
  OrderType,
} from "./types";

function readPubkey(buf: Buffer, offset: number): PublicKey {
  return new PublicKey(buf.slice(offset, offset + 32));
}

function readU64(buf: Buffer, offset: number): BN {
  return new BN(buf.slice(offset, offset + 8), "le");
}

function readI64(buf: Buffer, offset: number): BN {
  return new BN(buf.slice(offset, offset + 8), "le").fromTwos(64);
}

function readU16(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function readU8(buf: Buffer, offset: number): number {
  return buf.readUInt8(offset);
}

function decodeMarketCreated(buf: Buffer): MarketCreatedEvent {
  return {
    type      : "MarketCreated",
    market    : readPubkey(buf, 1),
    baseMint  : readPubkey(buf, 33),
    quoteMint : readPubkey(buf, 65),
    tickSize  : readU64(buf, 97),
    lotSize   : readU64(buf, 105),
    feeBps    : readU16(buf, 113),
    timestamp : readI64(buf, 115),
  };
}

function decodeOrderPlaced(buf: Buffer): OrderPlacedEvent {
  return {
    type      : "OrderPlaced",
    market    : readPubkey(buf, 1),
    order     : readPubkey(buf, 33),
    owner     : readPubkey(buf, 65),
    side      : readU8(buf, 97) as Side,
    orderType : readU8(buf, 98) as OrderType,
    price     : readU64(buf, 99),
    qty       : readU64(buf, 107),
    expiry    : readI64(buf, 115),
    createdAt : readI64(buf, 123),
  };
}

function decodeOrderFilled(buf: Buffer): OrderFilledEvent {
  return {
    type      : "OrderFilled",
    market    : readPubkey(buf, 1),
    order     : readPubkey(buf, 33),
    maker     : readPubkey(buf, 65),
    taker     : readPubkey(buf, 97),
    fillPrice : readU64(buf, 129),
    fillQty   : readU64(buf, 137),
    timestamp : readI64(buf, 145),
  };
}

function decodeOrderCancelled(buf: Buffer): OrderCancelledEvent {
  return {
    type      : "OrderCancelled",
    market    : readPubkey(buf, 1),
    order     : readPubkey(buf, 33),
    owner     : readPubkey(buf, 65),
    timestamp : readI64(buf, 97),
  };
}

function decodeOrderExpired(buf: Buffer): OrderExpiredEvent {
  return {
    type      : "OrderExpired",
    market    : readPubkey(buf, 1),
    order     : readPubkey(buf, 33),
    owner     : readPubkey(buf, 65),
    timestamp : readI64(buf, 97),
  };
}

export function decodeEvent(raw: Buffer | Uint8Array): P2PEvent | null {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length === 0) return null;

  switch (buf.readUInt8(0)) {
    case EVT.MARKET_CREATED  : return decodeMarketCreated(buf);
    case EVT.ORDER_PLACED    : return decodeOrderPlaced(buf);
    case EVT.ORDER_FILLED    : return decodeOrderFilled(buf);
    case EVT.ORDER_CANCELLED : return decodeOrderCancelled(buf);
    case EVT.ORDER_EXPIRED   : return decodeOrderExpired(buf);
    default                  : return null;
  }
}

export function parseEventsFromLogs(logMessages: string[]): P2PEvent[] {
  const events: P2PEvent[] = [];

  for (const line of logMessages) {
    const prefix = "Program data: ";
    if (!line.startsWith(prefix)) continue;
    const raw = Buffer.from(line.slice(prefix.length).trim(), "base64");
    const event = decodeEvent(raw);
    if (event) events.push(event);
  }

  return events;
}
