/** Types for the transfer flow, from a validated intent to a confirmed signature. */

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
