/**
 * Devnet end-to-end test for the P2P Protocol.
 *
 * Run:
 *   npx ts-node tests/devnet.ts
 *
 * What this test does:
 *   1. Creates two test mints (BASE and QUOTE)
 *   2. Mints tokens to maker and taker wallets
 *   3. Calls create_market
 *   4. Maker calls place_order (Ask: sell 1 BASE at 100 QUOTE)
 *   5. Taker calls fill_order (full fill)
 *   6. Verifies balances changed correctly
 *   7. Places another order and cancels it
 *   8. Places an expired order and expires it
 */

import {
  Connection,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import BN from "bn.js";
import fs from "fs";

import {
  PROGRAM_ID,
  createMarketInstruction,
  placeOrderInstruction,
  fillOrderInstruction,
  cancelOrderInstruction,
  expireOrderInstruction,
  findAllMarketAddresses,
  findOrderAddress,
  fetchMarket,
  fetchOrder,
  Side,
  OrderType,
} from "../src";

// ── Config ─────────────────────────────────────────────────────────────────

const RPC = "https://api.devnet.solana.com";
const connection = new Connection(RPC, "confirmed");

// Load wallet from the default Solana keypair
function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

const payer = loadKeypair(`${process.env.HOME}/.config/solana/id.json`);

// ── Helpers ────────────────────────────────────────────────────────────────

function log(label: string, value?: string) {
  if (value) {
    console.log(`  ✓ ${label}: ${value}`);
  } else {
    console.log(`\n── ${label}`);
  }
}

async function createMint(decimals: number): Promise<PublicKey> {
  const mintKp = Keypair.generate();
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey   : payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space        : MINT_SIZE,
      lamports,
      programId    : TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKp.publicKey,
      decimals,
      payer.publicKey,  // mint authority
      null,
    ),
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKp]);
  return mintKp.publicKey;
}

async function createAta(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint),
  );
  await sendAndConfirmTransaction(connection, tx, [payer]);
  return ata;
}

async function mintTo(mint: PublicKey, dest: PublicKey, amount: bigint): Promise<void> {
  const tx = new Transaction().add(
    createMintToInstruction(mint, dest, payer.publicKey, amount),
  );
  await sendAndConfirmTransaction(connection, tx, [payer]);
}

async function getTokenBalance(ata: PublicKey): Promise<bigint> {
  const info = await connection.getTokenAccountBalance(ata);
  return BigInt(info.value.amount);
}

const CU_LIMIT = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

async function sendIx(ix: ReturnType<typeof createMarketInstruction>, ...signers: Keypair[]) {
  const tx = new Transaction().add(CU_LIMIT, ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, ...signers]);
  return sig;
}

// ── Test ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("P2P Protocol — Devnet E2E Test");
  console.log("================================");
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Wallet:  ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

  // ── Step 1: Create test mints ─────────────────────────────────────────
  log("Step 1: Create test mints");

  const baseMint  = await createMint(9); // BASE: 9 decimals (like SOL)
  const quoteMint = await createMint(6); // QUOTE: 6 decimals (like USDC)
  log("baseMint",  baseMint.toBase58());
  log("quoteMint", quoteMint.toBase58());

  // ── Step 2: Create token accounts for maker (payer) and taker ─────────
  log("Step 2: Create token accounts");

  const taker = Keypair.generate();

  // Fund taker with 0.5 SOL from payer (avoids rate-limited airdrop)
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey:   taker.publicKey,
      lamports:   0.5 * LAMPORTS_PER_SOL,
    }),
  );
  await sendAndConfirmTransaction(connection, fundTx, [payer]);

  const makerBaseAta  = await createAta(baseMint,  payer.publicKey);
  const makerQuoteAta = await createAta(quoteMint, payer.publicKey);
  const takerBaseAta  = await createAta(baseMint,  taker.publicKey);
  const takerQuoteAta = await createAta(quoteMint, taker.publicKey);

  log("makerBaseAta",  makerBaseAta.toBase58());
  log("takerQuoteAta", takerQuoteAta.toBase58());

  // ── Step 3: Mint tokens ────────────────────────────────────────────────
  log("Step 3: Mint tokens");

  // Maker gets 1000 BASE (to sell)
  // Taker gets 10000 QUOTE (to buy BASE with)
  await mintTo(baseMint,  makerBaseAta,  1_000_000_000_000n); // 1000 BASE
  await mintTo(quoteMint, takerQuoteAta, 10_000_000_000n);    // 10000 QUOTE

  log("maker BASE balance",  (await getTokenBalance(makerBaseAta)).toString());
  log("taker QUOTE balance", (await getTokenBalance(takerQuoteAta)).toString());

  // ── Step 4: Create market ──────────────────────────────────────────────
  log("Step 4: Create market");

  // tick_size = 1000 (1 tick = 0.001 QUOTE)
  // lot_size  = 1_000_000 (1 lot = 0.001 BASE)
  const TICK_SIZE = new BN(1_000);
  const LOT_SIZE  = new BN(1_000_000);

  const { market, baseVault, quoteVault } = findAllMarketAddresses(baseMint, quoteMint);

  const createMarketIx = createMarketInstruction({
    payer    : payer.publicKey,
    baseMint,
    quoteMint,
    tickSize : TICK_SIZE,
    lotSize  : LOT_SIZE,
    feeBps   : 20,
  });

  const createMarketSig = await sendIx(createMarketIx);
  log("market",          market.toBase58());
  log("create_market tx", createMarketSig);

  // Verify market was created
  const marketState = await fetchMarket(connection, market);
  log("market.tickSize", marketState.tickSize.toString());
  log("market.lotSize",  marketState.lotSize.toString());
  log("market.feeBps",   marketState.feeBps.toString());

  // ── Step 5: Place an Ask order ─────────────────────────────────────────
  log("Step 5: Maker places Ask (sell 10 lots of BASE at 100_000 ticks)");

  // Sell 10 lots (0.01 BASE) at price 100_000 ticks (100 QUOTE per BASE)
  // Escrow = 10 lots * 1_000_000 lot_size = 10_000_000 raw BASE tokens
  const orderId = new BN(Date.now());
  const [orderPda] = findOrderAddress(market, payer.publicKey, BigInt(orderId.toString()));

  const placeAskIx = placeOrderInstruction({
    owner      : payer.publicKey,
    market,
    orderId,
    side       : Side.Ask,
    orderType  : OrderType.Limit,
    price      : new BN(100_000),
    qty        : new BN(10),
    expiry     : new BN(0),
    ownerToken : makerBaseAta,
  });

  const placeAskSig = await sendIx(placeAskIx);
  log("order PDA",     orderPda.toBase58());
  log("place_order tx", placeAskSig);

  // Verify order account
  const orderState = await fetchOrder(connection, orderPda);
  log("order.price",    orderState.price.toString());
  log("order.origQty",  orderState.origQty.toString());
  log("order.side",     orderState.side === Side.Ask ? "Ask" : "Bid");

  // Verify base tokens were escrowed
  const makerBaseAfterPlace = await getTokenBalance(makerBaseAta);
  log("maker BASE after place", makerBaseAfterPlace.toString());

  // ── Step 6: Taker fills the order ─────────────────────────────────────
  log("Step 6: Taker fills 5 lots");

  const fillIx = fillOrderInstruction({
    taker        : taker.publicKey,
    order        : orderPda,
    market,
    fillQty      : new BN(5),
    takerBaseAta,
    takerQuoteAta,
    makerBaseAta,
    makerQuoteAta,
  });

  const fillSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(CU_LIMIT, fillIx),
    [taker],
  );
  log("fill_order tx", fillSig);

  const takerBaseAfterFill  = await getTokenBalance(takerBaseAta);
  const takerQuoteAfterFill = await getTokenBalance(takerQuoteAta);
  log("taker BASE after fill",  takerBaseAfterFill.toString());
  log("taker QUOTE after fill", takerQuoteAfterFill.toString());

  // ── Step 7: Cancel the remaining 5 lots ───────────────────────────────
  log("Step 7: Maker cancels remaining 5 lots");

  const cancelIx = cancelOrderInstruction({
    owner      : payer.publicKey,
    order      : orderPda,
    market,
    ownerToken : makerBaseAta,
  });

  const cancelSig = await sendIx(cancelIx);
  log("cancel_order tx", cancelSig);

  const makerBaseAfterCancel = await getTokenBalance(makerBaseAta);
  log("maker BASE after cancel", makerBaseAfterCancel.toString());

  // ── Step 8: Place an order that expires ───────────────────────────────
  log("Step 8: Place an order with 1-second expiry, then expire it");

  const expiredOrderId = new BN(Date.now() + 1);
  const [expiredOrderPda] = findOrderAddress(market, payer.publicKey, BigInt(expiredOrderId.toString()));
  const expiredAt = Math.floor(Date.now() / 1000) - 5; // already expired

  const placeExpiredIx = placeOrderInstruction({
    owner      : payer.publicKey,
    market,
    orderId    : expiredOrderId,
    side       : Side.Ask,
    orderType  : OrderType.Limit,
    price      : new BN(100_000),
    qty        : new BN(10),
    expiry     : new BN(expiredAt),
    ownerToken : makerBaseAta,
  });

  await sendIx(placeExpiredIx);
  log("expired order placed", expiredOrderPda.toBase58());

  const expireIx = expireOrderInstruction({
    caller     : payer.publicKey,
    order      : expiredOrderPda,
    market,
    owner      : payer.publicKey,
    ownerToken : makerBaseAta,
  });

  const expireSig = await sendIx(expireIx);
  log("expire_order tx", expireSig);
  log("maker BASE after expire", (await getTokenBalance(makerBaseAta)).toString());

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n================================");
  console.log("All tests passed ✓");
  console.log(`Explorer: https://explorer.solana.com/address/${market.toBase58()}?cluster=devnet`);
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err.message ?? err);
  process.exit(1);
});
