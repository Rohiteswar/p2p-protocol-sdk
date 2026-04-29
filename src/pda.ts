import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, SEED_MARKET, SEED_VAULT, SEED_ORDER, SEED_BASE, SEED_QUOTE } from "./constants";

/**
 * Derive the Market PDA for a given base/quote mint pair.
 * Seeds: ["market", baseMint, quoteMint]
 */
export function findMarketAddress(
  baseMint  : PublicKey,
  quoteMint : PublicKey,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_MARKET, baseMint.toBuffer(), quoteMint.toBuffer()],
    programId,
  );
}

/**
 * Derive the base vault PDA for a given market.
 * Seeds: ["vault", market, "base"]
 */
export function findBaseVaultAddress(
  market    : PublicKey,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VAULT, market.toBuffer(), SEED_BASE],
    programId,
  );
}

/**
 * Derive the quote vault PDA for a given market.
 * Seeds: ["vault", market, "quote"]
 */
export function findQuoteVaultAddress(
  market    : PublicKey,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VAULT, market.toBuffer(), SEED_QUOTE],
    programId,
  );
}

/**
 * Derive an Order PDA.
 * Seeds: ["order", market, owner, orderId (u64 little-endian)]
 *
 * @param orderId  - client-chosen u64 (as BN or number)
 */
export function findOrderAddress(
  market    : PublicKey,
  owner     : PublicKey,
  orderId   : bigint | number,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  const id = BigInt(orderId);
  // write as little-endian u64
  idBuf.writeBigUInt64LE(id);

  return PublicKey.findProgramAddressSync(
    [SEED_ORDER, market.toBuffer(), owner.toBuffer(), idBuf],
    programId,
  );
}

/**
 * Convenience: derive all addresses for a market in one call.
 */
export function findAllMarketAddresses(
  baseMint  : PublicKey,
  quoteMint : PublicKey,
  programId  = PROGRAM_ID,
) {
  const [market, marketBump]       = findMarketAddress(baseMint, quoteMint, programId);
  const [baseVault, baseVaultBump] = findBaseVaultAddress(market, programId);
  const [quoteVault, quoteVaultBump] = findQuoteVaultAddress(market, programId);
  return { market, marketBump, baseVault, baseVaultBump, quoteVault, quoteVaultBump };
}
