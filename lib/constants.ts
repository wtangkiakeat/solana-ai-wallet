/**
 * Project-wide constants.
 *
 * This file is the single source of truth for network identity and money
 * arithmetic. Nothing here depends on the AI layer: the app must behave
 * correctly even if the language model returns nonsense.
 */

/** 1 SOL = 1,000,000,000 lamports. All internal maths uses integer lamports. */
export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** SOL has exactly 9 decimal places. More precision than that is not representable. */
export const SOL_DECIMALS = 9;

/**
 * The only cluster this application is allowed to talk to.
 *
 * Mainnet is deliberately unreachable: the wallet plugin is pinned to this
 * chain, the RPC plugin is the devnet one, and `DEVNET_GENESIS_HASH` below is
 * verified against the live RPC before any transfer is offered for signing.
 */
export const CLUSTER = 'devnet' as const;
export const CHAIN = 'solana:devnet' as const;

/**
 * Genesis hash of Solana Devnet, fetched from https://api.devnet.solana.com
 * via `getGenesisHash`. Used as a hard safety check that we are not pointed at
 * mainnet by a misconfigured RPC URL.
 */
export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

/** Genesis hash of mainnet-beta, listed only so we can name it in an error message. */
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

/** Public devnet RPC. Override with NEXT_PUBLIC_SOLANA_RPC_URL for a reliable demo. */
export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';

/**
 * Solana's base signature fee: 5,000 lamports per signature. A simple SOL
 * transfer carries one signature. This is only a *fallback* — the preview tries
 * `getFeeForMessage` against the real planned message first.
 */
export const BASE_FEE_LAMPORTS_PER_SIGNATURE = 5_000n;
export const FALLBACK_FEE_LAMPORTS = BASE_FEE_LAMPORTS_PER_SIGNATURE;

/**
 * Extra lamports kept back on top of the estimated fee when deciding the
 * maximum spendable amount. Covers a fee that rises between preview and
 * submission (for example a prioritisation fee added by the planner).
 */
export const FEE_SAFETY_BUFFER_LAMPORTS = 5_000n;

/** Largest transfer the MVP will prepare, as a guard against a typo or a bad parse. */
export const MAX_TRANSFER_LAMPORTS = 100n * LAMPORTS_PER_SOL;

/** Build a Solana Explorer URL for a transaction on devnet. */
export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

/** Build a Solana Explorer URL for an address on devnet. */
export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${CLUSTER}`;
}
