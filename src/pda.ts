import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, SEED_MARKET, SEED_VAULT, SEED_ORDER, SEED_BASE, SEED_QUOTE } from "./constants";

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

export function findBaseVaultAddress(
  market    : PublicKey,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VAULT, market.toBuffer(), SEED_BASE],
    programId,
  );
}

export function findQuoteVaultAddress(
  market    : PublicKey,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VAULT, market.toBuffer(), SEED_QUOTE],
    programId,
  );
}

export function findOrderAddress(
  market    : PublicKey,
  owner     : PublicKey,
  orderId   : bigint | number,
  programId  = PROGRAM_ID,
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(orderId));

  return PublicKey.findProgramAddressSync(
    [SEED_ORDER, market.toBuffer(), owner.toBuffer(), idBuf],
    programId,
  );
}

export function findAllMarketAddresses(
  baseMint  : PublicKey,
  quoteMint : PublicKey,
  programId  = PROGRAM_ID,
) {
  const [market, marketBump]           = findMarketAddress(baseMint, quoteMint, programId);
  const [baseVault, baseVaultBump]     = findBaseVaultAddress(market, programId);
  const [quoteVault, quoteVaultBump]   = findQuoteVaultAddress(market, programId);
  return { market, marketBump, baseVault, baseVaultBump, quoteVault, quoteVaultBump };
}
