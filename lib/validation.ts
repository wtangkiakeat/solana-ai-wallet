/**
 * The security layer.
 *
 * Every rule that protects the user's money lives here, and none of it trusts
 * the language model. The model's only job is to turn a sentence into a
 * candidate { amount, recipient }. These functions decide whether that
 * candidate is allowed to become a transaction.
 */

import { isAddress } from '@solana/kit';
import { z } from 'zod';

import { parseSolToLamports } from './amounts';
import {
  FEE_SAFETY_BUFFER_LAMPORTS,
  LAMPORTS_PER_SOL,
  MAX_TRANSFER_LAMPORTS,
  SOL_DECIMALS,
} from './constants';

/* -------------------------------------------------------------------------- */
/* Request into /api/interpret                                                */
/* -------------------------------------------------------------------------- */

/**
 * Factual, chain-read context the browser hands to the endpoint so the model
 * can talk about the real wallet instead of inventing numbers. Every field is
 * optional: the endpoint still works with no wallet connected.
 */
export const WalletContextSchema = z.object({
  address: z.string().max(64).optional(),
  balanceLamports: z.string().regex(/^\d+$/).max(25).optional(),
  feeLamports: z.string().regex(/^\d+$/).max(25).optional(),
});

export const InterpretRequestSchema = z.object({
  message: z.string().min(1, 'Type a message first.').max(1000),
  context: WalletContextSchema.optional(),
});

export type InterpretRequest = z.infer<typeof InterpretRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Raw language-model output                                                  */
/* -------------------------------------------------------------------------- */

export const INTENT_ACTIONS = [
  'transfer_sol',
  'check_balance',
  'max_sendable',
  // Read-only actions. These can never move funds, so they need no approval
  // step — but their output is still rendered from chain data, never from the
  // model's recollection.
  'explain_transaction',
  'recent_activity',
  'inspect_address',
  'unsupported',
] as const;

export const INTENT_STATUSES = ['ready', 'needs_clarification', 'unsupported'] as const;

/**
 * What the model is contractually required to return. Anything that does not
 * match this shape exactly is thrown away — we never try to repair it, because
 * a half-understood instruction about money is worse than no answer.
 *
 * `.strict()` makes an unexpected extra key a validation failure, so a model
 * cannot smuggle in fields the UI might later read.
 */
export const AiIntentSchema = z
  .object({
    status: z.enum(INTENT_STATUSES),
    action: z.enum(INTENT_ACTIONS),
    /** Decimal string, never a number — see lib/amounts.ts for why. */
    amountSol: z.string().max(40).nullable().optional(),
    recipient: z.string().max(64).nullable().optional(),
    /** A transaction signature, for explain_transaction. */
    signature: z.string().max(128).nullable().optional(),
    /** An address to look up, for inspect_address. */
    subjectAddress: z.string().max(64).nullable().optional(),
    explanation: z.string().min(1).max(600),
    clarificationQuestion: z.string().max(300).nullable().optional(),
  })
  .strict();

export type AiIntent = z.infer<typeof AiIntentSchema>;

/* -------------------------------------------------------------------------- */
/* Response out of /api/interpret                                             */
/* -------------------------------------------------------------------------- */

export const INTERPRET_ENGINES = ['openai', 'anthropic', 'local-parser'] as const;
export type InterpretEngine = (typeof INTERPRET_ENGINES)[number];

export const InterpretResponseSchema = z.object({
  status: z.enum(INTENT_STATUSES),
  action: z.enum(INTENT_ACTIONS),
  amountSol: z.string().nullable(),
  recipient: z.string().nullable(),
  signature: z.string().nullable(),
  subjectAddress: z.string().nullable(),
  explanation: z.string(),
  clarificationQuestion: z.string().nullable(),
  warnings: z.array(z.string()),
  requiresConfirmation: z.boolean(),
  /** Which engine produced this reading. Shown in the UI so the user is never misled. */
  engine: z.enum(INTERPRET_ENGINES),
});

export type InterpretResponse = z.infer<typeof InterpretResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Address validation                                                         */
/* -------------------------------------------------------------------------- */

export type AddressCheck = { ok: true; address: string } | { ok: false; reason: string };

/**
 * Validate a recipient address with Solana's own address rules: the base58
 * alphabet, and exactly 32 bytes once decoded.
 */
export function validateAddress(candidate: unknown): AddressCheck {
  if (typeof candidate !== 'string') {
    return { ok: false, reason: 'No recipient address was given.' };
  }

  const raw = candidate.trim();

  if (raw === '') {
    return { ok: false, reason: 'No recipient address was given.' };
  }
  if (raw.length < 32 || raw.length > 44) {
    return {
      ok: false,
      reason: `"${raw}" is not a Solana address. A Solana address is 32 to 44 characters long.`,
    };
  }
  if (!isAddress(raw)) {
    return {
      ok: false,
      reason: `"${raw}" is not a valid Solana address. Check it for typos — Solana addresses never contain the characters 0, O, I or l.`,
    };
  }

  return { ok: true, address: raw };
}

/**
 * Validate a transaction signature: base58, and 64 bytes once decoded, which
 * is 87 or 88 base58 characters.
 */
export function validateSignature(candidate: unknown): AddressCheck {
  if (typeof candidate !== 'string') {
    return { ok: false, reason: 'No transaction signature was given.' };
  }

  const raw = candidate.trim();

  if (raw === '') {
    return { ok: false, reason: 'No transaction signature was given.' };
  }
  if (raw.length < 86 || raw.length > 90) {
    return {
      ok: false,
      reason: `"${raw.slice(0, 24)}…" is not a Solana transaction signature. Signatures are 87 or 88 characters long.`,
    };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(raw)) {
    return {
      ok: false,
      reason: 'That is not a valid signature. Solana signatures never contain the characters 0, O, I or l.',
    };
  }

  return { ok: true, address: raw };
}

/* -------------------------------------------------------------------------- */
/* Transfer validation                                                        */
/* -------------------------------------------------------------------------- */

export type TransferValidationInput = {
  /** Address string as produced by the model, or typed by the user. */
  recipient: unknown;
  /** Decimal SOL string as produced by the model, or typed by the user. */
  amountSol: unknown;
  /** The connected wallet's address, used to spot a self-transfer. */
  senderAddress: string | null;
  /** Real on-chain balance in lamports, read from RPC. `null` when unknown. */
  balanceLamports: bigint | null;
  /** Fee estimate in lamports for this transaction. */
  feeLamports: bigint;
  /** Whether the app has confirmed the RPC really is devnet. */
  isDevnetVerified: boolean;
};

export type TransferValidationOk = {
  ok: true;
  recipient: string;
  lamports: bigint;
  feeLamports: bigint;
  totalLamports: bigint;
  warnings: string[];
};

export type TransferValidationFailed = {
  ok: false;
  errors: string[];
  warnings: string[];
};

export type TransferValidation = TransferValidationOk | TransferValidationFailed;

/**
 * The gate every transfer must pass before the user is even shown a confirm
 * button. It runs the whole checklist and collects every problem rather than
 * stopping at the first one, so the user can fix everything at once.
 */
export function validateTransfer(input: TransferValidationInput): TransferValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Network. A wrong cluster is a hard stop, never a warning.
  if (!input.isDevnetVerified) {
    errors.push(
      'The app has not confirmed that it is connected to Solana Devnet. No transfer will be prepared until it has.',
    );
  }

  // 2. Recipient.
  const addressCheck = validateAddress(input.recipient);
  if (!addressCheck.ok) {
    errors.push(addressCheck.reason);
  }

  // 3. Amount — exact integer lamports, no floating point anywhere.
  const amountCheck = parseSolToLamports(
    typeof input.amountSol === 'string' ? input.amountSol : '',
  );
  if (!amountCheck.ok) {
    errors.push(amountCheck.reason);
  }

  if (!addressCheck.ok || !amountCheck.ok) {
    return { ok: false, errors, warnings };
  }

  const lamports = amountCheck.lamports;
  const recipient = addressCheck.address;

  // 4. Upper bound, as a guard against a misparsed amount.
  if (lamports > MAX_TRANSFER_LAMPORTS) {
    errors.push(
      `This MVP will not prepare transfers larger than ${MAX_TRANSFER_LAMPORTS / LAMPORTS_PER_SOL} SOL.`,
    );
  }

  // 5. A self-transfer is legal on chain but almost never what the user meant.
  if (input.senderAddress && recipient === input.senderAddress) {
    warnings.push(
      'The recipient is your own wallet address. This transfer would only cost you the network fee.',
    );
  }

  // 6. Spendable balance, including the fee and a small buffer.
  const totalLamports = lamports + input.feeLamports;

  if (input.balanceLamports === null) {
    errors.push(
      'Your balance could not be read from the network, so the transfer cannot be checked against it.',
    );
  } else {
    const spendable = maxSendableLamports(input.balanceLamports, input.feeLamports);

    if (totalLamports > input.balanceLamports) {
      errors.push(
        `Not enough SOL. This transfer needs ${formatForMessage(totalLamports)} SOL including the network fee, but your balance is ${formatForMessage(input.balanceLamports)} SOL.`,
      );
    } else if (spendable <= 0n) {
      errors.push('Your balance is too low to cover even the network fee.');
    } else if (lamports > spendable) {
      errors.push(
        `This would leave too little SOL to cover the network fee. The most you can send right now is ${formatForMessage(spendable)} SOL.`,
      );
    }

    if (
      errors.length === 0 &&
      input.balanceLamports - totalLamports < FEE_SAFETY_BUFFER_LAMPORTS * 2n
    ) {
      warnings.push(
        'This transfer uses almost your whole balance. You may not be able to pay a fee afterwards.',
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    recipient,
    lamports,
    feeLamports: input.feeLamports,
    totalLamports,
    warnings,
  };
}

/**
 * The largest amount that can be sent while still leaving the fee behind.
 * Returns 0 when the balance cannot cover a fee at all.
 */
export function maxSendableLamports(balanceLamports: bigint, feeLamports: bigint): bigint {
  const spendable = balanceLamports - feeLamports - FEE_SAFETY_BUFFER_LAMPORTS;
  return spendable > 0n ? spendable : 0n;
}

/** Local formatter, so this module needs no import from the display helpers. */
function formatForMessage(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(SOL_DECIMALS, '0')
    .replace(/0+$/, '');
  return fraction === '' ? `${whole}` : `${whole}.${fraction}`;
}
