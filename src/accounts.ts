import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { Market, Order, Side, OrderType } from "./types";
import { MARKET_SIZE, ORDER_SIZE } from "./constants";

// ── Deserializers ──────────────────────────────────────────────────────────
// These read the exact byte layout that Rust writes (little-endian, #[repr(C)]).

/**
 * Deserialize a Market account's raw data buffer.
 */
export function deserializeMarket(data: Buffer): Market {
  if (data.length < MARKET_SIZE) {
    throw new Error(`Market account too small: ${data.length} < ${MARKET_SIZE}`);
  }

  let offset = 0;

  const discriminator = data.slice(offset, offset + 8); offset += 8;
  const baseMint      = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const quoteMint     = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const baseVault     = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const quoteVault    = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const authority     = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const tickSize      = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const lotSize       = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const feeBps           = data.readUInt16LE(offset);  offset += 2;
  const bump             = data.readUInt8(offset);     offset += 1;
  const baseVaultBump    = data.readUInt8(offset);     offset += 1;
  const quoteVaultBump   = data.readUInt8(offset);     offset += 1;
  // 1 byte padding

  return { discriminator, baseMint, quoteMint, baseVault, quoteVault, authority, tickSize, lotSize, feeBps, bump, baseVaultBump, quoteVaultBump };
}

/**
 * Deserialize an Order account's raw data buffer.
 */
export function deserializeOrder(data: Buffer): Order {
  if (data.length < ORDER_SIZE) {
    throw new Error(`Order account too small: ${data.length} < ${ORDER_SIZE}`);
  }

  let offset = 0;

  const discriminator = data.slice(offset, offset + 8); offset += 8;
  const market        = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const owner         = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const price         = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const origQty       = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const filledQty     = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const expiry        = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const createdAt     = new BN(data.slice(offset, offset + 8), "le");   offset += 8;
  const side          = data.readUInt8(offset) as Side;                  offset += 1;
  const orderType     = data.readUInt8(offset) as OrderType;             offset += 1;
  const bump          = data.readUInt8(offset);                          offset += 1;
  // 1 byte padding

  return { discriminator, market, owner, price, origQty, filledQty, expiry, createdAt, side, orderType, bump };
}

// ── On-chain fetchers ──────────────────────────────────────────────────────

/**
 * Fetch and deserialize a Market account.
 */
export async function fetchMarket(
  connection : Connection,
  address    : PublicKey,
): Promise<Market> {
  const info = await connection.getAccountInfo(address);
  if (!info) throw new Error(`Market account not found: ${address.toBase58()}`);
  return deserializeMarket(info.data as Buffer);
}

/**
 * Fetch and deserialize an Order account.
 */
export async function fetchOrder(
  connection : Connection,
  address    : PublicKey,
): Promise<Order> {
  const info = await connection.getAccountInfo(address);
  if (!info) throw new Error(`Order account not found: ${address.toBase58()}`);
  return deserializeOrder(info.data as Buffer);
}

/**
 * Fetch all live Order accounts for a given market.
 * Uses getProgramAccounts with a memcmp filter on the market field (offset 8).
 */
export async function fetchOrdersByMarket(
  connection : Connection,
  market     : PublicKey,
  programId  : PublicKey,
): Promise<Array<{ pubkey: PublicKey; order: Order }>> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: ORDER_SIZE },
      { memcmp: { offset: 8, bytes: market.toBase58() } }, // market field at offset 8
    ],
  });

  return accounts.map(({ pubkey, account }) => ({
    pubkey,
    order: deserializeOrder(account.data as Buffer),
  }));
}

/**
 * Fetch all live Order accounts for a given owner.
 * Uses getProgramAccounts with a memcmp filter on the owner field (offset 40).
 */
export async function fetchOrdersByOwner(
  connection : Connection,
  owner      : PublicKey,
  programId  : PublicKey,
): Promise<Array<{ pubkey: PublicKey; order: Order }>> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: ORDER_SIZE },
      { memcmp: { offset: 40, bytes: owner.toBase58() } }, // owner field at offset 40
    ],
  });

  return accounts.map(({ pubkey, account }) => ({
    pubkey,
    order: deserializeOrder(account.data as Buffer),
  }));
}

// ── Derived helpers ────────────────────────────────────────────────────────

/** Returns the remaining unfilled quantity of an order */
export function remainingQty(order: Order): BN {
  return order.origQty.sub(order.filledQty);
}

/** Returns true if the order is fully filled */
export function isFullyFilled(order: Order): boolean {
  return order.filledQty.gte(order.origQty);
}

/** Returns true if the order is expired (given a current unix timestamp) */
export function isExpired(order: Order, nowUnix: number): boolean {
  if (order.expiry.isZero()) return false;
  return order.expiry.ltn(nowUnix);
}
