/** Types for the assistant conversation. */

import type { InterpretEngine } from '@/lib/validation';

export type ChatRole = 'user' | 'assistant';

/**
 * How a message should be read. The distinction matters: `verified` content was
 * read from the chain, while `assistant` prose came from a language model. The
 * UI must never let the two look the same.
 */
export type ChatTone = 'plain' | 'warning' | 'error';

/** A label/value pair the app read from Solana itself, shown beside AI prose. */
export type VerifiedFact = {
  label: string;
  value: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  tone: ChatTone;
  /** Which engine produced this text, for assistant messages. */
  engine?: InterpretEngine;
  /** Chain-read figures. Rendered in a distinct, clearly marked block. */
  facts?: VerifiedFact[];
  at: number;
};
