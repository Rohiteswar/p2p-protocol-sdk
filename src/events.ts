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

// ── Layout helpers ─────────────────────────────────────────────────────────

function readPubkey(buf: Buffer, offset: number): PublicKey {
  return new PublicKey(buf.slice(offset, offset + 32));
}

function readU64(buf: Buffer, offset: number): BN {
  return new BN(buf.slice(offset, offset + 8), "le");
}

function readI64(buf: Buffer, offset: number): BN {
  // Read as unsigned then interpret sign via two's complement
  const raw = new BN(buf.slice(offset, offset + 8), "le");
  return raw.fromTwos(64);
}

function readU16(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function readU8(buf: Buffer, offset: number): number {
  return buf.readUInt8(offset);
}

// ── Per-event decoders ─────────────────────────────────────────────────────
// Each function reads the event payload starting AFTER the 1-byte discriminator.
// Byte offsets are relative to position 1 (after discriminator).

function decodeMarketCreated(buf: Buffer): MarketCreatedEvent {
  // Layout (after discriminator):
  //   market    32  → offset 1
  //   baseMint  32  → offset 33
  //   quoteMint 32  → offset 65
  //   tickSize   8  → offset 97
  //   lotSize    8  → offset 105
  //   feeBps     2  → offset 113
  //   timestamp  8  → offset 115
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
  // Layout (after discriminator):
  //   market     32 → offset 1
  //   order      32 → offset 33
  //   owner      32 → offset 65
  //   side        1 → offset 97
  //   orderType   1 → offset 98
  //   price       8 → offset 99
  //   qty         8 → offset 107
  //   expiry      8 → offset 115
  //   createdAt   8 → offset 123
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
  // Layout (after discriminator):
  //   market     32 → offset 1
  //   order      32 → offset 33
  //   maker      32 → offset 65
  //   taker      32 → offset 97
  //   fillPrice   8 → offset 129
  //   fillQty     8 → offset 137
  //   timestamp   8 → offset 145
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
  // Layout (after discriminator):
  //   market    32 → offset 1
  //   order     32 → offset 33
  //   owner     32 → offset 65
  //   timestamp  8 → offset 97
  return {
    type      : "OrderCancelled",
    market    : readPubkey(buf, 1),
    order     : readPubkey(buf, 33),
    owner     : readPubkey(buf, 65),
    timestamp : readI64(buf, 97),
  };
}

function decodeOrderExpired(buf: Buffer): OrderExpiredEvent {
  // Same layout as OrderCancelled
  return {
    type      : "OrderExpired",
    market    : readPubkey(buf, 1),
    order     : readPubkey(buf, 33),
    owner     : readPubkey(buf, 65),
    timestamp : readI64(buf, 97),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Decode a raw event buffer (as received from `sol_log_data` / Geyser).
 * Returns null if the discriminator is unknown.
 */
export function decodeEvent(raw: Buffer | Uint8Array): P2PEvent | null {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length === 0) return null;

  const discriminator = buf.readUInt8(0);

  switch (discriminator) {
    case EVT.MARKET_CREATED  : return decodeMarketCreated(buf);
    case EVT.ORDER_PLACED    : return decodeOrderPlaced(buf);
    case EVT.ORDER_FILLED    : return decodeOrderFilled(buf);
    case EVT.ORDER_CANCELLED : return decodeOrderCancelled(buf);
    case EVT.ORDER_EXPIRED   : return decodeOrderExpired(buf);
    default                  : return null;
  }
}

/**
 * Parse events from a Solana transaction's log messages.
 *
 * Geyser / YellowstoneRPC delivers data logs as base64-encoded strings
 * in the `logMessages` array, prefixed with "Program data: ".
 *
 * Example log line:
 *   "Program data: AQIDBA=="
 */
export function parseEventsFromLogs(logMessages: string[]): P2PEvent[] {
  const events: P2PEvent[] = [];

  for (const line of logMessages) {
    const prefix = "Program data: ";
    if (!line.startsWith(prefix)) continue;

    const b64 = line.slice(prefix.length).trim();
    const raw = Buffer.from(b64, "base64");
    const event = decodeEvent(raw);
    if (event) events.push(event);
  }

  return events;
}
