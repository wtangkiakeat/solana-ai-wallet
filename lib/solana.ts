/**
 * The Solana client, plus the two chain reads the UI depends on:
 * a devnet identity check and a real fee estimate.
 *
 * Plugin order matters. `walletSigner` installs `client.payer` / `client.identity`,
 * and the RPC plugin requires a payer to be present, so the wallet plugin is
 * applied first.
 */

import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  compileTransactionMessage,
  createClient,
  getBase64Decoder,
  getCompiledTransactionMessageEncoder,
  lamports,
  setTransactionMessageLifetimeUsingBlockhash,
  type TransactionMessage,
  type TransactionMessageWithBlockhashLifetime,
  type TransactionMessageWithFeePayer,
} from '@solana/kit';
import { solanaDevnetRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';

import {
  CHAIN,
  DEVNET_GENESIS_HASH,
  FALLBACK_FEE_LAMPORTS,
  MAINNET_GENESIS_HASH,
  RPC_URL,
} from './constants';

/**
 * Build the application client.
 *
 * Pinned to devnet in three independent places: the wallet plugin's `chain`,
 * the devnet RPC plugin, and `verifyDevnet` below. Mainnet is not reachable
 * through this client.
 */
export function createAppClient() {
  return createClient()
    .use(walletSigner({ chain: CHAIN }))
    .use(solanaDevnetRpc({ rpcUrl: RPC_URL }));
}

export type AppClient = ReturnType<typeof createAppClient>;

/**
 * A module-scope client, as `ClientProvider` requires a stable reference.
 * Created lazily so a server render does not build one it will never use.
 */
let sharedClient: AppClient | undefined;

export function getAppClient(): AppClient {
  sharedClient ??= createAppClient();
  return sharedClient;
}

/* -------------------------------------------------------------------------- */
/* Devnet verification                                                        */
/* -------------------------------------------------------------------------- */

export type NetworkCheck =
  | { status: 'devnet'; genesisHash: string }
  | { status: 'wrong-network'; genesisHash: string; name: string }
  | { status: 'unreachable'; message: string };

/**
 * Ask the RPC which chain it actually serves and compare its genesis hash with
 * devnet's. This catches a misconfigured `NEXT_PUBLIC_SOLANA_RPC_URL` that
 * points at mainnet, which no amount of client-side configuration would.
 */
export async function verifyDevnet(client: AppClient): Promise<NetworkCheck> {
  try {
    const genesisHash = await client.rpc.getGenesisHash().send();

    if (genesisHash === DEVNET_GENESIS_HASH) {
      return { status: 'devnet', genesisHash };
    }

    const name = genesisHash === MAINNET_GENESIS_HASH ? 'mainnet-beta' : 'an unknown cluster';
    return { status: 'wrong-network', genesisHash, name };
  } catch (error) {
    return { status: 'unreachable', message: describeRpcError(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Balance                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Read a real lamport balance. Returns BigInt so the value can go straight into
 * the validation rules without passing through a `number`.
 */
export async function fetchBalanceLamports(
  client: AppClient,
  address: string,
  abortSignal?: AbortSignal,
): Promise<bigint> {
  const response = await client.rpc
    // The address type is branded; the caller has already validated the string.
    .getBalance(address as Parameters<AppClient['rpc']['getBalance']>[0])
    .send({ abortSignal });

  return BigInt(response.value);
}

/** Whether an address already has an account on chain. Used only for a warning. */
export async function recipientIsUnfunded(
  client: AppClient,
  address: string,
): Promise<boolean | null> {
  try {
    const lamports = await fetchBalanceLamports(client, address);
    return lamports === 0n;
  } catch {
    // A failed check must never block a transfer; the warning is simply omitted.
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Fee estimation                                                             */
/* -------------------------------------------------------------------------- */

/** The RPC parameter type for `getFeeForMessage`, which is a branded base64 string. */
type MessageBytesBase64 = Parameters<AppClient['rpc']['getFeeForMessage']>[0];

/** Whether a transaction message already carries a blockhash lifetime. */
function hasBlockhashLifetime(
  message: TransactionMessage & TransactionMessageWithFeePayer,
): message is TransactionMessage & TransactionMessageWithFeePayer & TransactionMessageWithBlockhashLifetime {
  const constraint = (message as { lifetimeConstraint?: { blockhash?: unknown } })
    .lifetimeConstraint;
  return typeof constraint?.blockhash === 'string';
}

export type FeeEstimate = {
  lamports: bigint;
  /** `rpc` when the network priced the real message, `fallback` when it could not. */
  source: 'rpc' | 'fallback';
};

/**
 * Price the actual planned message with `getFeeForMessage`.
 *
 * If the RPC cannot price it (expired blockhash, transport error, null value),
 * fall back to Solana's base signature fee. The caller shows the user which of
 * the two happened, so an estimate is never presented as a quoted price.
 */
export async function estimateFeeLamports(
  client: AppClient,
  message: TransactionMessage & TransactionMessageWithFeePayer,
): Promise<FeeEstimate> {
  try {
    // The planner leaves the blockhash to the executor, so a planned message
    // usually has no lifetime yet. `getFeeForMessage` returns null for a
    // message it cannot tie to a known blockhash, so one is attached here —
    // purely to get a price. The transaction that is actually sent is planned
    // again at send time with its own fresh blockhash.
    const priceable = hasBlockhashLifetime(message)
      ? message
      : setTransactionMessageLifetimeUsingBlockhash(
          (await client.rpc.getLatestBlockhash().send()).value,
          message,
        );

    const compiled = compileTransactionMessage(priceable);
    const bytes = getCompiledTransactionMessageEncoder().encode(compiled);
    const base64 = getBase64Decoder().decode(bytes);

    const response = await client.rpc.getFeeForMessage(base64 as MessageBytesBase64).send();

    if (response.value === null || response.value === undefined) {
      return { lamports: FALLBACK_FEE_LAMPORTS, source: 'fallback' };
    }

    return { lamports: BigInt(response.value), source: 'rpc' };
  } catch {
    return { lamports: FALLBACK_FEE_LAMPORTS, source: 'fallback' };
  }
}

/* -------------------------------------------------------------------------- */
/* Transaction construction                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build the native SOL transfer instruction.
 *
 * Called twice: once to plan a message for the fee estimate, and again when the
 * user approves. The second call is built from the validated values that were
 * actually displayed, so the transaction sent to the wallet cannot drift from
 * the one shown in the preview.
 *
 * `client.payer` is the wallet's signer. It can only produce a signature by
 * asking the wallet, which prompts the user — this application never holds key
 * material of any kind.
 */
export function buildTransferInstruction(
  client: AppClient,
  recipient: string,
  amountLamports: bigint,
) {
  return getTransferSolInstruction({
    source: client.payer,
    destination: address(recipient),
    amount: lamports(amountLamports),
  });
}

/* -------------------------------------------------------------------------- */
/* Error messages                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Turn an unknown thrown value into something a person can act on.
 *
 * Wallet rejection is singled out because it is the most common "failure" in a
 * demo and is not an error at all — the user simply said no.
 */
export function describeRpcError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);

  if (/aborted|AbortError/i.test(text)) {
    return 'The request was cancelled.';
  }
  if (/429|rate.?limit/i.test(text)) {
    return 'The public devnet RPC is rate limiting this app. Wait a moment and try again, or set NEXT_PUBLIC_SOLANA_RPC_URL to a dedicated devnet endpoint.';
  }
  if (/fetch|network|Failed to fetch|ENOTFOUND|ECONNREFUSED/i.test(text)) {
    return 'Could not reach the Solana devnet RPC. Check your internet connection.';
  }

  return text || 'An unknown network error occurred.';
}

/** Whether a thrown value is the user declining the signature request. */
export function isUserRejection(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /reject|denied|declined|cancel|User rejected/i.test(text);
}
