import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "./splIds";
import BN from "bn.js";
import {
  PROGRAM_ID,
  IX,
} from "./constants";
import {
  findMarketAddress,
  findBaseVaultAddress,
  findQuoteVaultAddress,
  findOrderAddress,
  findAllMarketAddresses,
} from "./pda";
import {
  CreateMarketParams,
  PlaceOrderParams,
  FillOrderParams,
  CancelOrderParams,
  ExpireOrderParams,
  Side,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Write a u64 BN as 8-byte little-endian into a Buffer at offset */
function writeU64(buf: Buffer, value: BN, offset: number): void {
  const bytes = value.toArrayLike(Buffer, "le", 8);
  bytes.copy(buf, offset);
}

/** Write a u64 bigint as 8-byte little-endian into a Buffer at offset */
function writeU64Big(buf: Buffer, value: bigint, offset: number): void {
  buf.writeBigUInt64LE(value, offset);
}

/** Write a i64 BN as 8-byte little-endian into a Buffer at offset */
function writeI64(buf: Buffer, value: BN, offset: number): void {
  // BN handles signed encoding via two's complement in LE
  const bytes = value.toTwos(64).toArrayLike(Buffer, "le", 8);
  bytes.copy(buf, offset);
}

// ── Instruction builders ───────────────────────────────────────────────────

/**
 * Build a `create_market` instruction.
 *
 * Instruction data layout:
 *   [0]      discriminator  (1 byte)
 *   [1..9]   tick_size      (u64 LE)
 *   [9..17]  lot_size       (u64 LE)
 *   [17..19] fee_bps        (u16 LE)
 *   [19]     market_bump    (u8)
 *   [20]     bv_bump        (u8)
 *   [21]     qv_bump        (u8)
 */
export function createMarketInstruction(
  params    : CreateMarketParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const { market, marketBump, baseVault, baseVaultBump, quoteVault, quoteVaultBump } =
    findAllMarketAddresses(params.baseMint, params.quoteMint, programId);

  // Encode instruction data: 1 + 8 + 8 + 2 + 1 + 1 + 1 = 22 bytes
  const data = Buffer.alloc(22);
  data.writeUInt8(IX.CREATE_MARKET, 0);
  writeU64(data, params.tickSize, 1);
  writeU64(data, params.lotSize, 9);
  data.writeUInt16LE(params.feeBps, 17);
  data.writeUInt8(marketBump, 19);
  data.writeUInt8(baseVaultBump, 20);
  data.writeUInt8(quoteVaultBump, 21);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.payer,          isSigner: true,  isWritable: true  },
      { pubkey: market,                isSigner: false, isWritable: true  },
      { pubkey: params.baseMint,       isSigner: false, isWritable: false },
      { pubkey: params.quoteMint,      isSigner: false, isWritable: false },
      { pubkey: baseVault,             isSigner: false, isWritable: true  },
      { pubkey: quoteVault,            isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a `place_order` instruction.
 *
 * Instruction data layout:
 *   [0]      discriminator (1 byte)
 *   [1..9]   order_id   (u64 LE)
 *   [9..17]  price      (u64 LE)
 *   [17..25] qty        (u64 LE)
 *   [25..33] expiry     (i64 LE)
 *   [33]     side       (u8)
 *   [34]     order_type (u8)
 *   [35]     order_bump (u8)
 */
export function placeOrderInstruction(
  params    : PlaceOrderParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const [order, orderBump] = findOrderAddress(
    params.market,
    params.owner,
    BigInt(params.orderId.toString()),
    programId,
  );

  // Determine which vault to use based on side
  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);
  const vault = params.side === Side.Bid ? quoteVault : baseVault;

  // Encode instruction data: 1 + 8 + 8 + 8 + 8 + 1 + 1 + 1 = 36 bytes
  const data = Buffer.alloc(36);
  let off = 0;
  data.writeUInt8(IX.PLACE_ORDER, off); off += 1;
  writeU64(data, params.orderId, off);  off += 8;
  writeU64(data, params.price, off);    off += 8;
  writeU64(data, params.qty, off);      off += 8;
  writeI64(data, params.expiry, off);   off += 8;
  data.writeUInt8(params.side, off);    off += 1;
  data.writeUInt8(params.orderType, off); off += 1;
  data.writeUInt8(orderBump, off);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.owner,            isSigner: true,  isWritable: true  },
      { pubkey: order,                   isSigner: false, isWritable: true  },
      { pubkey: params.market,           isSigner: false, isWritable: false },
      { pubkey: params.ownerToken,       isSigner: false, isWritable: true  },
      { pubkey: vault,                   isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a `fill_order` instruction.
 *
 * Instruction data layout:
 *   [0]     discriminator (1 byte)
 *   [1..9]  fill_qty (u64 LE)
 */
export function fillOrderInstruction(
  params    : FillOrderParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);

  // Encode instruction data: 1 + 8 = 9 bytes
  const data = Buffer.alloc(9);
  data.writeUInt8(IX.FILL_ORDER, 0);
  writeU64(data, params.fillQty, 1);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.taker,           isSigner: true,  isWritable: true  },
      { pubkey: params.order,           isSigner: false, isWritable: true  },
      { pubkey: params.market,          isSigner: false, isWritable: false },
      { pubkey: params.takerBaseAta,    isSigner: false, isWritable: true  },
      { pubkey: params.takerQuoteAta,   isSigner: false, isWritable: true  },
      { pubkey: params.makerBaseAta,    isSigner: false, isWritable: true  },
      { pubkey: params.makerQuoteAta,   isSigner: false, isWritable: true  },
      { pubkey: baseVault,              isSigner: false, isWritable: true  },
      { pubkey: quoteVault,             isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a `cancel_order` instruction.
 *
 * Instruction data layout:
 *   [0]  discriminator (1 byte only)
 */
export function cancelOrderInstruction(
  params    : CancelOrderParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);

  // Caller must pass the right vault; we include both so the program can
  // verify. The program picks the right one based on order.side.
  const data = Buffer.alloc(1);
  data.writeUInt8(IX.CANCEL_ORDER, 0);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.owner,           isSigner: true,  isWritable: true  },
      { pubkey: params.order,           isSigner: false, isWritable: true  },
      { pubkey: params.market,          isSigner: false, isWritable: false },
      { pubkey: params.ownerToken,      isSigner: false, isWritable: true  },
      // The program determines which vault based on order.side.
      // Pass both; the program only uses the matching one.
      { pubkey: baseVault,              isSigner: false, isWritable: true  },
      { pubkey: quoteVault,             isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build an `expire_order` instruction.
 *
 * Instruction data layout:
 *   [0]  discriminator (1 byte only)
 */
export function expireOrderInstruction(
  params    : ExpireOrderParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);

  const data = Buffer.alloc(1);
  data.writeUInt8(IX.EXPIRE_ORDER, 0);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.caller,          isSigner: true,  isWritable: true  },
      { pubkey: params.order,           isSigner: false, isWritable: true  },
      { pubkey: params.market,          isSigner: false, isWritable: false },
      { pubkey: params.owner,           isSigner: false, isWritable: true  },
      { pubkey: params.ownerToken,      isSigner: false, isWritable: true  },
      { pubkey: baseVault,              isSigner: false, isWritable: true  },
      { pubkey: quoteVault,             isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ── Re-export PDA helpers for convenience ──────────────────────────────────
export {
  findMarketAddress,
  findBaseVaultAddress,
  findQuoteVaultAddress,
  findOrderAddress,
  findAllMarketAddresses,
};
