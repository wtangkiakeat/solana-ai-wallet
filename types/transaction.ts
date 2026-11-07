/** Types for the transfer flow, from a validated intent to a confirmed signature. */

/**
 * The result of running the transaction against the network without signing it.
 *
 * This is what the chain says *would* happen, so it is reported separately from
 * what the app intends to happen. A simulation that fails is a hard stop.
 */
export type SimulationResult =
  | {
      kind: 'succeeded';
      /** Change in the sender's lamports, including the fee. Negative. */
      senderDelta: bigint | null;
      /** Change in the recipient's lamports. Positive. */
      recipientDelta: bigint | null;
      computeUnits: bigint | null;
    }
  /** The network reported a failure we recognise and trust. A hard stop. */
  | { kind: 'failed'; reason: string; logs: string[] }
  /**
   * The simulation ran but returned something we cannot confidently interpret.
   * Surfaced as a warning rather than a block: refusing a valid transfer on an
   * error we do not understand would be worse than letting the user decide.
   */
  | { kind: 'inconclusive'; reason: string; logs: string[] }
  | { kind: 'unavailable'; reason: string };

/** One decoded instruction, so the user can see everything they are signing. */
export type InstructionSummary = {
  programAddress: string;
  /** A readable name when the program is known, otherwise null. */
  programName: string | null;
  /** What this instruction does, when it can be determined. */
  description: string | null;
};

/** What the chain knows about the recipient, used for a first-use warning. */
export type RecipientProfile = {
  /** No account on chain yet. */
  isUnfunded: boolean;
  /** No transaction history at all — a brand new or mistyped address. */
  hasNoHistory: boolean;
};

/**
 * A transfer that has passed every validation rule and is waiting for the user
 * to approve it. Amounts are BigInt lamports, so nothing is rounded on the way
 * to the wallet.
 */
export type PendingTransfer = {
  recipient: string;
  lamports: bigint;
  feeLamports: bigint;
  /** `rpc` when the network priced the real message, `fallback` when it could not. */
  feeSource: 'rpc' | 'fallback';
  totalLamports: bigint;
  /** The AI's explanation, shown clearly labelled as such. */
  explanation: string;
  warnings: string[];
  /** What the chain says would happen if this were submitted. */
  simulation: SimulationResult;
  /** Every instruction in the transaction, so nothing is hidden. */
  instructions: InstructionSummary[];
  /** First-use signals for the recipient. */
  recipientProfile: RecipientProfile | null;
};

/** The result of a submission, as reported by the chain. */
export type TransferOutcome =
  | { kind: 'confirmed'; signature: string; recipient: string; lamports: bigint; at: number }
  | { kind: 'failed'; message: string; signature?: string; at: number }
  | { kind: 'rejected'; at: number };

/** One row in the session's transaction list. */
export type TransactionRecord = {
  id: string;
  recipient: string;
  lamports: bigint;
  signature: string | null;
  status: 'confirmed' | 'failed' | 'rejected';
  detail?: string;
  at: number;
};

/** Where the UI is in the send flow. Drives which panel is on screen. */
export type FlowStage = 'idle' | 'interpreting' | 'preparing' | 'awaiting-approval' | 'signing' | 'done';
