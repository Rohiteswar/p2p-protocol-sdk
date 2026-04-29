import { PublicKey } from "@solana/web3.js";

// Replace with your deployed program ID after `cargo-build-sbf` + deploy
export const PROGRAM_ID = new PublicKey(
  "HazZUxenwxgxDumK5rt89mhXfffnVpA7Nyvx87kMts18"
);

// PDA seed prefixes (must match Rust exactly)
export const SEED_MARKET = Buffer.from("market");
export const SEED_VAULT  = Buffer.from("vault");
export const SEED_ORDER  = Buffer.from("order");
export const SEED_BASE   = Buffer.from("base");
export const SEED_QUOTE  = Buffer.from("quote");

// Instruction discriminators (first byte of ix data — matches lib.rs ix module)
export const IX = {
  CREATE_MARKET : 0,
  PLACE_ORDER   : 1,
  FILL_ORDER    : 2,
  CANCEL_ORDER  : 3,
  EXPIRE_ORDER  : 4,
} as const;

// Event discriminators (first byte of event payload — matches events.rs)
export const EVT = {
  ORDER_PLACED    : 1,
  ORDER_FILLED    : 2,
  ORDER_CANCELLED : 3,
  ORDER_EXPIRED   : 4,
  MARKET_CREATED  : 5,
} as const;

// On-chain account sizes (bytes) — must match Rust SIZE constants
export const MARKET_SIZE = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 1 + 1 + 1 + 1; // 190
export const ORDER_SIZE  = 8 + 32 + 32 + 8  + 8  + 8  + 8 + 8 + 1 + 1 + 1 + 1; // 116

// SPL token account size
export const TOKEN_ACCOUNT_SIZE = 165;
