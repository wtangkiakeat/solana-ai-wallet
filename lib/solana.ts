/**
 * The Solana client, plus the two chain reads the UI depends on:
 * a devnet identity check and a real fee estimate.
 *
 * Plugin order matters. `walletSigner` installs `client.payer` / `client.identity`,
 * and the RPC plugin requires a payer to be present, so the wallet plugin is
 * applied first.
 */

import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  address,
  compileTransaction,
  compileTransactionMessage,
  createClient,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageEncoder,
  lamports,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
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
import type {
  ActivityEntry,
  AddressReport,
  InstructionSummary,
  RecipientProfile,
  SimulationResult,
  TransactionSummary,
} from '@/types/transaction';

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
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run the transaction against the network without signing it.
 *
 * This is the strongest check in the app, because it is the chain's own answer
 * rather than ours: it executes the real instructions against real account
 * state and reports what would change. `sigVerify: false` lets an unsigned
 * transaction be simulated, which is the whole point — the user has not
 * approved anything yet.
 *
 * The balance deltas it returns are what the preview shows as "what will
 * actually change", in the manner of Phantom's pre-signature preview.
 */
export async function simulateTransfer(
  client: AppClient,
  message: TransactionMessage & TransactionMessageWithFeePayer,
  sender: string,
  recipient: string,
): Promise<SimulationResult> {
  try {
    // compileTransaction needs a lifetime; the planner has not set one yet.
    const withLifetime = hasBlockhashLifetime(message)
      ? message
      : setTransactionMessageLifetimeUsingBlockhash(
          (await client.rpc.getLatestBlockhash().send()).value,
          message,
        );

    // Simulate a version 0 copy of the message.
    //
    // The planner produces version 1 messages, and the Devnet RPC cannot
    // simulate those: it answers MaxLoadedAccountsDataSizeExceeded for every
    // one, including transactions that then succeed on chain. Verified by
    // simulating the same message at both versions — v1 always fails, v0
    // returns err: null with correct balances.
    //
    // For a transfer this is a faithful stand-in: the instructions, fee payer,
    // accounts and amount are identical, and the versions differ only in
    // address-table support, which this transaction does not use. The
    // transaction actually signed and sent is still the planner's v1 message,
    // so this is a simulation of an equivalent, not of the exact bytes — a
    // caveat recorded in the README rather than glossed over.
    const ready = { ...withLifetime, version: 0 } as typeof withLifetime;

    const senderAddress = address(sender);
    const recipientAddress = address(recipient);

    const wire = getBase64EncodedWireTransaction(compileTransaction(ready));

    const response = await client.rpc
      .simulateTransaction(wire, {
        accounts: { addresses: [senderAddress, recipientAddress], encoding: 'base64' },
        commitment: 'confirmed',
        encoding: 'base64',
        // The transaction is deliberately unsigned at this point.
        replaceRecentBlockhash: true,
        sigVerify: false,
      })
      .send();

    const { accounts, err, logs, unitsConsumed } = response.value;

    if (err) {
      const recognised = describeSimulationError(err);

      return {
        // Only block on a failure we understand. An unfamiliar error is
        // reported honestly as inconclusive rather than dressed up as either
        // a pass or a verdict.
        kind: recognised === null ? 'inconclusive' : 'failed',
        reason: recognised ?? `The network returned an error we do not recognise: ${describeRawError(err)}`,
        logs: [...(logs ?? [])],
      };
    }

    // Post-simulation balances minus current balances gives the real change.
    const [senderAfter, recipientAfter] = accounts ?? [null, null];

    const senderDelta = senderAfter
      ? BigInt(senderAfter.lamports) - (await fetchBalanceLamports(client, sender))
      : null;
    const recipientDelta = recipientAfter
      ? BigInt(recipientAfter.lamports) - (await fetchBalanceLamports(client, recipient))
      : null;

    return {
      kind: 'succeeded',
      senderDelta,
      recipientDelta,
      computeUnits: unitsConsumed ?? null,
    };
  } catch (error) {
    // A simulation that cannot run is reported as unavailable, never as a pass.
    return { kind: 'unavailable', reason: describeRpcError(error) };
  }
}

/**
 * Render an RPC error value as text.
 *
 * Solana's error objects carry BigInt values — `{InstructionError: [0n, {Custom: 2n}]}` —
 * and `JSON.stringify` throws outright on those. The replacer below is what
 * keeps a failed transaction from turning into an unrelated crash.
 */
function describeRawError(err: unknown): string {
  if (typeof err === 'string') return err.slice(0, 160);

  try {
    return JSON.stringify(err, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ).slice(0, 160);
  } catch {
    return String(err).slice(0, 160);
  }
}

/**
 * Translate a simulation error we trust, or return null when we do not
 * recognise it.
 *
 * Returning null matters: an unrecognised error becomes a warning rather than
 * a block. Simulation quirks exist — the version 1 case above is one — and
 * refusing a user's valid transfer because of one would be the worse failure.
 */
function describeSimulationError(err: unknown): string | null {
  const text = typeof err === 'string' ? err : JSON.stringify(err);

  if (/InsufficientFundsForRent/i.test(text)) {
    return 'The recipient would be left below the rent-exempt minimum. Send a larger amount.';
  }
  if (/InsufficientFunds/i.test(text)) {
    return 'The sender does not have enough SOL to cover this transfer and its fee.';
  }
  if (/AccountNotFound/i.test(text)) {
    return 'An account in this transaction does not exist on Devnet.';
  }
  if (/AccountInUse|AlreadyProcessed|BlockhashNotFound/i.test(text)) {
    return 'The network could not process this transaction. Try again in a moment.';
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Instruction disclosure                                                     */
/* -------------------------------------------------------------------------- */

const KNOWN_PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  ComputeBudget111111111111111111111111111111: 'Compute Budget Program',
};

/**
 * Describe every instruction the transaction contains.
 *
 * A transfer should be exactly one System Program instruction. Listing them
 * lets the user confirm that, rather than taking the app's word that nothing
 * else was bundled in alongside it.
 */
export function summarizeInstructions(
  message: TransactionMessage & TransactionMessageWithFeePayer,
  amountLamports: bigint,
): InstructionSummary[] {
  return message.instructions.map((instruction) => {
    const programAddress = String(instruction.programAddress);
    const programName = KNOWN_PROGRAMS[programAddress] ?? null;

    const description =
      programAddress === SYSTEM_PROGRAM_ADDRESS
        ? `Transfer ${amountLamports} lamports`
        : programName === 'Compute Budget Program'
          ? 'Set the compute budget for this transaction'
          : null;

    return { programAddress, programName, description };
  });
}

/* -------------------------------------------------------------------------- */
/* Recipient profile                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What the chain knows about the recipient.
 *
 * An address with no balance and no history is either brand new or mistyped,
 * and a mistyped address is the most expensive mistake available here. Wallets
 * such as MetaMask surface the same "first time sending here" signal.
 */
export async function profileRecipient(
  client: AppClient,
  recipient: string,
): Promise<RecipientProfile | null> {
  try {
    const recipientAddress = address(recipient);

    const [balance, signatures] = await Promise.all([
      client.rpc.getBalance(recipientAddress).send(),
      client.rpc.getSignaturesForAddress(recipientAddress, { limit: 1 }).send(),
    ]);

    return {
      isUnfunded: BigInt(balance.value) === 0n,
      hasNoHistory: signatures.length === 0,
    };
  } catch {
    // A failed profile must never block a transfer; the warning is just omitted.
    return null;
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

/* -------------------------------------------------------------------------- */
/* Read-only chain lookups                                                    */
/* -------------------------------------------------------------------------- */

/**
 * These three functions are the wallet's "explain" half. None of them can move
 * funds, so none needs an approval step — but every figure they return still
 * comes from the chain, never from the model. The assistant may describe what
 * they found; it may not be the source of it.
 */

/** Transaction versions the RPC should be willing to return. */
const MAX_TX_VERSION = 1;

/** Decode one transaction into something a person can read. */
export async function fetchTransactionSummary(
  client: AppClient,
  rawSignature: string,
): Promise<TransactionSummary | null> {
  const response = await client.rpc
    .getTransaction(signature(rawSignature), {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: MAX_TX_VERSION,
    } as Parameters<AppClient['rpc']['getTransaction']>[1])
    .send();

  if (!response) return null;

  const meta = response.meta;
  const instructions = response.transaction.message.instructions as readonly {
    program?: string;
    programId?: unknown;
    parsed?: { type?: string; info?: Record<string, unknown> };
  }[];

  // A plain SOL transfer is a System Program `transfer`. Anything else is
  // reported by program name rather than guessed at.
  let transfer: TransactionSummary['transfer'] = null;
  const programs: string[] = [];

  for (const instruction of instructions) {
    const programName =
      instruction.program ?? KNOWN_PROGRAMS[String(instruction.programId)] ?? String(instruction.programId);
    if (programName && !programs.includes(programName)) programs.push(programName);

    if (!transfer && instruction.parsed?.type === 'transfer' && instruction.parsed.info) {
      const info = instruction.parsed.info;
      if (info.source && info.destination && info.lamports !== undefined) {
        transfer = {
          from: String(info.source),
          to: String(info.destination),
          lamports: BigInt(String(info.lamports)),
        };
      }
    }
  }

  return {
    signature: rawSignature,
    error: meta?.err ? describeRawError(meta.err) : null,
    slot: BigInt(response.slot),
    blockTime: response.blockTime === null || response.blockTime === undefined ? null : Number(response.blockTime),
    feeLamports: BigInt(meta?.fee ?? 0),
    transfer,
    programs,
  };
}

/**
 * The wallet's recent on-chain activity.
 *
 * Per-transaction details are fetched for a small number of entries only: the
 * public Devnet RPC rate-limits, and a list that loads is worth more than a
 * complete one that fails. An entry whose detail could not be read still shows
 * its signature and status, with the balance change left blank rather than
 * guessed.
 */
export async function fetchRecentActivity(
  client: AppClient,
  address_: string,
  limit = 5,
): Promise<ActivityEntry[]> {
  const owner = address(address_);
  const signatures = await client.rpc.getSignaturesForAddress(owner, { limit }).send();

  const entries: ActivityEntry[] = [];

  for (const entry of signatures) {
    let delta: bigint | null = null;

    try {
      const detail = await client.rpc
        .getTransaction(entry.signature, {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: MAX_TX_VERSION,
        } as Parameters<AppClient['rpc']['getTransaction']>[1])
        .send();

      if (detail?.meta) {
        // Find this wallet among the transaction's accounts and read its
        // before/after balances.
        const keys = detail.transaction.message.accountKeys as readonly { pubkey?: unknown }[];
        const index = keys.findIndex((key) => String(key.pubkey ?? key) === address_);

        if (index >= 0 && detail.meta.preBalances && detail.meta.postBalances) {
          delta = BigInt(detail.meta.postBalances[index]) - BigInt(detail.meta.preBalances[index]);
        }
      }
    } catch {
      // Rate-limited or unavailable: leave the balance change blank.
    }

    entries.push({
      signature: String(entry.signature),
      slot: BigInt(entry.slot),
      blockTime: entry.blockTime === null || entry.blockTime === undefined ? null : Number(entry.blockTime),
      error: entry.err ? describeRawError(entry.err) : null,
      delta,
    });
  }

  return entries;
}

/** Everything the chain knows about an address. */
export async function inspectAddress(
  client: AppClient,
  address_: string,
): Promise<AddressReport> {
  const subject = address(address_);

  const [account, signatures] = await Promise.all([
    client.rpc.getAccountInfo(subject, { encoding: 'base64' }).send(),
    client.rpc.getSignaturesForAddress(subject, { limit: 10 }).send(),
  ]);

  const value = account.value;

  return {
    address: address_,
    lamports: value ? BigInt(value.lamports) : 0n,
    owner: value ? String(value.owner) : null,
    executable: value?.executable ?? false,
    isEmpty: value === null,
    recentSignatureCount: signatures.length,
  };
}
