# @p2p-protocol/sdk

TypeScript SDK for the **P2P Limit Order Protocol** — a fully on-chain, peer-to-peer orderbook DEX on Solana.

> **Status:** Live on Solana Devnet · Mainnet launch pending audit

---

## Install

```bash
npm install @p2p-protocol/sdk
```

## Program

| Network | Program ID |
|---------|-----------|
| Devnet  | `HazZUxenwxgxDumK5rt89mhXfffnVpA7Nyvx87kMts18` |

---

## Quick start

### Create a market

```ts
import { Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import {
  createMarketInstruction,
  findMarketAddress,
  findBaseVaultAddress,
  findQuoteVaultAddress,
} from "@p2p-protocol/sdk";

const conn = new Connection("https://api.devnet.solana.com");

const [market]     = await findMarketAddress(baseMint, quoteMint);
const [baseVault]  = await findBaseVaultAddress(market);
const [quoteVault] = await findQuoteVaultAddress(market);

const ix = createMarketInstruction({
  payer:     payer.publicKey,
  baseMint,
  quoteMint,
  tickSize:  new BN(1_000),      // raw quote units per tick
  lotSize:   new BN(1_000_000),  // raw base units per lot
  feeBps:    20,                 // 0.20%
});

await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer]);
```

### Place an order

```ts
import { placeOrderInstruction, findOrderAddress, Side, OrderType } from "@p2p-protocol/sdk";

const orderId = new BN(Date.now());
const [orderPda] = await findOrderAddress(market, maker.publicKey, orderId);

const ix = placeOrderInstruction({
  owner:      maker.publicKey,
  market,
  orderId,
  side:       Side.Ask,           // selling base token
  orderType:  OrderType.Limit,
  price:      new BN(100_000),    // ticks
  qty:        new BN(10),         // lots
  expiry:     new BN(0),          // 0 = no expiry
  ownerToken: makerBaseAta,       // debited at placement
});

await sendAndConfirmTransaction(conn, new Transaction().add(ix), [maker]);
```

### Fill an order

```ts
import { fillOrderInstruction } from "@p2p-protocol/sdk";

const ix = fillOrderInstruction({
  taker:         taker.publicKey,
  order:         orderPda,
  market,
  fillQty:       new BN(5),
  takerBaseAta,
  takerQuoteAta,
  makerBaseAta,
  makerQuoteAta,
});

await sendAndConfirmTransaction(conn, new Transaction().add(ix), [taker]);
```

### Cancel an order

```ts
import { cancelOrderInstruction } from "@p2p-protocol/sdk";

const ix = cancelOrderInstruction({
  owner:      maker.publicKey,
  order:      orderPda,
  market,
  ownerToken: makerBaseAta,
});

await sendAndConfirmTransaction(conn, new Transaction().add(ix), [maker]);
```

### Fetch & deserialize accounts

```ts
import { fetchMarket, fetchOrder, remainingQty, isExpired } from "@p2p-protocol/sdk";

const market = await fetchMarket(conn, marketPda);
console.log("tick size:", market.tickSize.toString());

const order = await fetchOrder(conn, orderPda);
console.log("remaining:", remainingQty(order).toString(), "lots");
console.log("expired:  ", isExpired(order, Date.now() / 1000));
```

### Decode events

```ts
import { parseEventsFromLogs } from "@p2p-protocol/sdk";

const tx = await conn.getTransaction(sig, { commitment: "confirmed" });
const events = parseEventsFromLogs(tx.meta.logMessages ?? []);

for (const evt of events) {
  if (evt.type === "OrderFilled") {
    console.log("fill price:", evt.fillPrice.toString());
    console.log("fill qty:  ", evt.fillQty.toString());
  }
}
```

---

## API reference

### PDA helpers

| Function | Seeds |
|----------|-------|
| `findMarketAddress(baseMint, quoteMint)` | `["market", baseMint, quoteMint]` |
| `findBaseVaultAddress(market)` | `["vault", market, "base"]` |
| `findQuoteVaultAddress(market)` | `["vault", market, "quote"]` |
| `findOrderAddress(market, owner, orderId)` | `["order", market, owner, orderId_le8]` |

### Instruction builders

| Function | Description |
|----------|-------------|
| `createMarketInstruction(params)` | Create a new market with base/quote mint pair |
| `placeOrderInstruction(params)` | Place a limit/IOC/FOK/post-only order |
| `fillOrderInstruction(params)` | Fill (partially or fully) a resting order |
| `cancelOrderInstruction(params)` | Cancel an order and reclaim escrowed tokens |
| `expireOrderInstruction(params)` | Expire a stale order (callable by anyone) |

### Enums

```ts
enum Side      { Bid = 0, Ask = 1 }
enum OrderType { Limit = 0, IOC = 1, FOK = 2, PostOnly = 3 }
```

---

## Order mechanics

**Escrow at placement:**
- `Bid`: locks `qty × price × tickSize` quote tokens in `quoteVault`
- `Ask`: locks `qty × lotSize` base tokens in `baseVault`

**At fill:**
- Maker and taker atomically swap through the vault PDAs
- Vault authority = market PDA (signed on-chain with stored bump)

**Order types** (IOC/FOK/PostOnly semantics enforced by off-chain router):
- `Limit` — rests in the book until filled, cancelled, or expired
- `IOC` — fill what's available, cancel the rest immediately
- `FOK` — fill entirely or cancel entirely
- `PostOnly` — rejected if it would immediately cross

---

## Author

Built by [Rohiteswar Velagapudi](https://x.com/rohiteswar3)

## License

MIT
