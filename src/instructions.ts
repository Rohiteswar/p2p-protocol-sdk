import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "./splIds";
import BN from "bn.js";
import { PROGRAM_ID, IX } from "./constants";
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

function writeU64(buf: Buffer, value: BN, offset: number): void {
  value.toArrayLike(Buffer, "le", 8).copy(buf, offset);
}

function writeI64(buf: Buffer, value: BN, offset: number): void {
  value.toTwos(64).toArrayLike(Buffer, "le", 8).copy(buf, offset);
}

export function createMarketInstruction(
  params    : CreateMarketParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const { market, marketBump, baseVault, baseVaultBump, quoteVault, quoteVaultBump } =
    findAllMarketAddresses(params.baseMint, params.quoteMint, programId);

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
      { pubkey: params.payer,            isSigner: true,  isWritable: true  },
      { pubkey: market,                  isSigner: false, isWritable: true  },
      { pubkey: params.baseMint,         isSigner: false, isWritable: false },
      { pubkey: params.quoteMint,        isSigner: false, isWritable: false },
      { pubkey: baseVault,               isSigner: false, isWritable: true  },
      { pubkey: quoteVault,              isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

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

  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);
  const vault = params.side === Side.Bid ? quoteVault : baseVault;

  const data = Buffer.alloc(36);
  let off = 0;
  data.writeUInt8(IX.PLACE_ORDER, off);   off += 1;
  writeU64(data, params.orderId, off);    off += 8;
  writeU64(data, params.price, off);      off += 8;
  writeU64(data, params.qty, off);        off += 8;
  writeI64(data, params.expiry, off);     off += 8;
  data.writeUInt8(params.side, off);      off += 1;
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

export function fillOrderInstruction(
  params    : FillOrderParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);

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

export function cancelOrderInstruction(
  params    : CancelOrderParams,
  programId  = PROGRAM_ID,
): TransactionInstruction {
  const [baseVault]  = findBaseVaultAddress(params.market, programId);
  const [quoteVault] = findQuoteVaultAddress(params.market, programId);

  const data = Buffer.alloc(1);
  data.writeUInt8(IX.CANCEL_ORDER, 0);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.owner,           isSigner: true,  isWritable: true  },
      { pubkey: params.order,           isSigner: false, isWritable: true  },
      { pubkey: params.market,          isSigner: false, isWritable: false },
      { pubkey: params.ownerToken,      isSigner: false, isWritable: true  },
      { pubkey: baseVault,              isSigner: false, isWritable: true  },
      { pubkey: quoteVault,             isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
    ],
    data,
  });
}

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

export {
  findMarketAddress,
  findBaseVaultAddress,
  findQuoteVaultAddress,
  findOrderAddress,
  findAllMarketAddresses,
};
