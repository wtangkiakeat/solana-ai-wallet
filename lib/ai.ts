/**
 * The AI layer. Server-side only — this module must never be imported from a
 * client component, because it reads API keys.
 *
 * Its single job is to turn one English sentence into a candidate intent. It is
 * deliberately powerless: it cannot read the chain, cannot sign anything, and
 * everything it returns is re-checked by lib/validation.ts before the user is
 * shown a confirm button.
 */

// Makes this module a build error if it is ever imported from a client
// component. It reads API keys, so that mistake must fail loudly rather
// than quietly bundle a secret into the browser.
import 'server-only';

import { formatSol, parseSolToLamports } from './amounts';
import { FALLBACK_FEE_LAMPORTS } from './constants';
import {
  AiIntentSchema,
  type AiIntent,
  type InterpretEngine,
  type InterpretRequest,
  type InterpretResponse,
  maxSendableLamports,
  validateAddress,
  validateSignature,
} from './validation';

const REQUEST_TIMEOUT_MS = 15_000;

/* -------------------------------------------------------------------------- */
/* Engine selection                                                           */
/* -------------------------------------------------------------------------- */

type Engine =
  | { kind: 'openai'; apiKey: string; model: string }
  | { kind: 'anthropic'; apiKey: string; model: string }
  | { kind: 'local-parser' };

/**
 * Pick an engine from the server environment.
 *
 * With no key configured the app still works, using the deterministic parser
 * below. The engine is reported back to the browser and shown in the UI, so a
 * user always knows whether a language model was involved.
 */
function selectEngine(): Engine {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      kind: 'openai',
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      kind: 'anthropic',
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-5-5',
    };
  }

  return { kind: 'local-parser' };
}

/** Whether a language model is configured. Used by the UI to explain itself. */
export function aiEngineName(): InterpretEngine {
  return selectEngine().kind;
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You read one message from a person using a Solana Devnet wallet and turn it into a single structured intent. You are a parser and an explainer, not an agent. You cannot move money: the application re-validates everything you return and the person must approve and sign every transfer in their own wallet.

Choose exactly one action:

- "transfer_sol": the person wants to send native SOL to an address. Put the amount in amountSol as a plain decimal string ("0.1", not 0.1 and not "100000000 lamports"). Put the address in recipient exactly as written, with no changes. Set status to "ready" only when BOTH the amount and a full recipient address are present in the message. If either is missing, set status to "needs_clarification" and ask for the missing piece in clarificationQuestion.
- "check_balance": the person is asking what they hold. status "ready".
- "max_sendable": the person is asking how much they could send, or to send everything. status "ready".
- "explain_transaction": the person pasted a transaction signature, or asked what a transaction did. Put the signature in signature, exactly as written. status "ready". If they ask about "my last transaction" without giving a signature, use "recent_activity" instead.
- "recent_activity": the person is asking what has happened on their wallet lately — recent transactions, history, "what did I send". status "ready".
- "inspect_address": the person is asking about a specific address other than a transfer — is it valid, does it exist, what is on it. Put it in subjectAddress. status "ready".
- "unsupported": anything this wallet cannot do. status "unsupported". This includes token or NFT transfers, swaps, staking, SOL prices or fiat conversion, and anything on a network other than Devnet.

Rules you must follow:

- Never invent an address. Only use an address that appears in the message. If the person refers to a saved contact, a name, or "my friend" without giving the address, that is "needs_clarification".
- Never invent a balance, a price, a fee or a transaction result. If the application supplied wallet facts below, you may restate those exact figures. If it supplied none, say the wallet is not connected instead of guessing.
- You have no price data. Any question about what SOL is worth in dollars or another currency is "unsupported".
- Keep amountSol exactly as the person expressed it. Do not round it, scale it, or convert it.
- explanation is one or two plain sentences addressed to the person, describing what will happen. No markdown.
- Set amountSol and recipient to null for every action other than "transfer_sol"; signature to null except for "explain_transaction"; subjectAddress to null except for "inspect_address".
- Never describe what a transaction or an address contains. You do not have that data — the application looks it up and displays it. Your explanation says what is being looked up, not what was found.
- Return only the JSON object.`;

/** Facts read from the chain by the application, so the model never has to guess. */
function buildContextBlock(context: InterpretRequest['context']): string {
  if (!context?.address) {
    return 'Wallet facts from the application: no wallet is connected. You have no balance to report.';
  }

  const lines = [`Wallet address: ${context.address}`];

  if (context.balanceLamports !== undefined) {
    const lamports = BigInt(context.balanceLamports);
    const fee = context.feeLamports !== undefined ? BigInt(context.feeLamports) : FALLBACK_FEE_LAMPORTS;
    lines.push(`Balance: ${formatSol(lamports)} SOL (${lamports} lamports)`);
    lines.push(`Estimated network fee for one transfer: ${formatSol(fee)} SOL (${fee} lamports)`);
    lines.push(`Largest amount that could be sent: ${formatSol(maxSendableLamports(lamports, fee))} SOL`);
  }

  return `Wallet facts from the application, all read from Solana Devnet. These are the only figures you may quote:\n${lines.join('\n')}`;
}

/* -------------------------------------------------------------------------- */
/* JSON schema shared by both providers                                       */
/* -------------------------------------------------------------------------- */

const INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'action',
    'amountSol',
    'recipient',
    'signature',
    'subjectAddress',
    'explanation',
    'clarificationQuestion',
  ],
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_clarification', 'unsupported'] },
    action: {
      type: 'string',
      enum: [
        'transfer_sol',
        'check_balance',
        'max_sendable',
        'explain_transaction',
        'recent_activity',
        'inspect_address',
        'unsupported',
      ],
    },
    amountSol: {
      type: ['string', 'null'],
      description: 'Plain decimal SOL amount as a string, or null.',
    },
    recipient: {
      type: ['string', 'null'],
      description: 'Solana address exactly as it appeared in the message, or null.',
    },
    signature: {
      type: ['string', 'null'],
      description: 'Transaction signature to explain, exactly as written, or null.',
    },
    subjectAddress: {
      type: ['string', 'null'],
      description: 'Address to look up, for inspect_address, or null.',
    },
    explanation: { type: 'string' },
    clarificationQuestion: { type: ['string', 'null'] },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

export class AiUnavailableError extends Error {}

async function callOpenAi(
  engine: Extract<Engine, { kind: 'openai' }>,
  message: string,
  contextBlock: string,
): Promise<unknown> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${engine.apiKey}`,
    },
    body: JSON.stringify({
      model: engine.model,
      temperature: 0,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
        { role: 'user', content: message },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'wallet_intent', strict: true, schema: INTENT_JSON_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiUnavailableError(`OpenAI returned ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new AiUnavailableError('OpenAI returned an empty response.');
  }

  return JSON.parse(content);
}

async function callAnthropic(
  engine: Extract<Engine, { kind: 'anthropic' }>,
  message: string,
  contextBlock: string,
): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': engine.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: engine.model,
      max_tokens: 700,
      temperature: 0,
      system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
      messages: [{ role: 'user', content: message }],
      // A forced tool call is how the Messages API guarantees a JSON shape.
      tools: [
        {
          name: 'report_intent',
          description: 'Report the structured reading of the message.',
          input_schema: INTENT_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'report_intent' },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiUnavailableError(`Anthropic returned ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
  };
  const toolUse = payload.content?.find((block) => block.type === 'tool_use');

  if (!toolUse?.input) {
    throw new AiUnavailableError('Anthropic returned no structured output.');
  }

  return toolUse.input;
}

/* -------------------------------------------------------------------------- */
/* Deterministic fallback parser                                              */
/* -------------------------------------------------------------------------- */

/** Base58 without the ambiguous characters 0, O, I and l. */
const BASE58_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
/**
 * A long token that was probably *meant* to be an address but is not valid
 * base58. Passing it through lets `validateAddress` explain what is wrong with
 * it, instead of the user being told no address was given when they typed one.
 * The 25-character floor keeps ordinary English words out.
 */
const ATTEMPTED_ADDRESS = /\b[A-Za-z0-9]{25,64}\b/;
const AMOUNT_WITH_UNIT = /(\d+(?:\.\d+)?|\.\d+)\s*(?:sol\b|\$?sol)/i;
const AMOUNT_AFTER_VERB = /\b(?:send|transfer|pay|move)\s+(\d+(?:\.\d+)?|\.\d+)/i;

/**
 * A rule-based reading of the message, used when no language model is
 * configured and as the fallback when the provider call fails.
 *
 * It understands far less than a model, but it never hallucinates, and it keeps
 * the app demonstrable without an API key. The UI labels its output clearly.
 */
export function parseLocally(message: string, context: InterpretRequest['context']): AiIntent {
  const text = message.trim();
  const lower = text.toLowerCase();

  // Price questions have no answer in this app, with or without a model.
  // Plurals are matched explicitly: \bdollar\b does not match "dollars".
  if (
    /\b(price|worth|usd|dollars?|bucks|myr|ringgit|euros?|eur|gbp|pounds?|fiat|convert|exchange rate)\b/.test(
      lower,
    )
  ) {
    return {
      status: 'unsupported',
      action: 'unsupported',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: null,
      explanation:
        'This wallet has no price data, so it cannot tell you what SOL is worth. It can read your Devnet balance and prepare SOL transfers.',
      clarificationQuestion: null,
    };
  }

  if (/\b(token|usdc|nft|swap|stake|staking|bridge|mainnet)\b/.test(lower)) {
    return {
      status: 'unsupported',
      action: 'unsupported',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: null,
      explanation:
        'This MVP only supports native SOL transfers on Devnet. Tokens, NFTs, swaps and staking are not available.',
      clarificationQuestion: null,
    };
  }

  if (/\b(max|maximum|safely|everything|all of it|all my)\b/.test(lower) && /\bsend\b/.test(lower)) {
    return {
      status: 'ready',
      action: 'max_sendable',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: null,
      explanation: 'Here is the most you could send while still covering the network fee.',
      clarificationQuestion: null,
    };
  }

  if (/\b(balance|how much.*(have|hold|got)|my sol)\b/.test(lower) && !/\bsend\b/.test(lower)) {
    return {
      status: 'ready',
      action: 'check_balance',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: null,
      explanation: context?.address
        ? 'Here is your wallet balance, read from Solana Devnet.'
        : 'Connect your wallet first and the balance will be read from Solana Devnet.',
      clarificationQuestion: null,
    };
  }

  // A bare 87-88 character base58 token is a transaction signature.
  const signatureMatch = text.match(/\b[1-9A-HJ-NP-Za-km-z]{86,90}\b/);
  if (signatureMatch && !/\bsend\b/.test(lower)) {
    return {
      status: 'ready',
      action: 'explain_transaction',
      amountSol: null,
      recipient: null,
      signature: signatureMatch[0],
      subjectAddress: null,
      explanation: 'Here is what that transaction did, read from Solana Devnet.',
      clarificationQuestion: null,
    };
  }

  if (/\b(history|recent|activity|last transaction|past transaction)\b/.test(lower)) {
    return {
      status: 'ready',
      action: 'recent_activity',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: null,
      explanation: 'Here is the recent activity on your wallet, read from Solana Devnet.',
      clarificationQuestion: null,
    };
  }

  const lookupMatch = text.match(BASE58_ADDRESS);
  if (lookupMatch && /\b(check|look ?up|inspect|valid|exists?|about)\b/.test(lower)) {
    return {
      status: 'ready',
      action: 'inspect_address',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: lookupMatch[0],
      explanation: 'Here is what Solana Devnet knows about that address.',
      clarificationQuestion: null,
    };
  }

  const isTransfer = /\b(send|transfer|pay|move)\b/.test(lower);

  if (isTransfer) {
    const addressMatch = text.match(BASE58_ADDRESS);
    const amountMatch = text.match(AMOUNT_WITH_UNIT) ?? text.match(AMOUNT_AFTER_VERB);

    const recipient = addressMatch?.[0] ?? text.match(ATTEMPTED_ADDRESS)?.[0] ?? null;
    const amountSol = amountMatch?.[1] ?? null;

    if (recipient && amountSol) {
      return {
        status: 'ready',
        action: 'transfer_sol',
        amountSol,
        recipient,
        signature: null,
        subjectAddress: null,
        explanation: `You are sending ${amountSol} SOL to ${recipient} on Solana Devnet.`,
        clarificationQuestion: null,
      };
    }

    return {
      status: 'needs_clarification',
      action: 'transfer_sol',
      amountSol,
      recipient,
      signature: null,
      subjectAddress: null,
      explanation: 'Some details are still missing before this transfer can be prepared.',
      clarificationQuestion: !recipient
        ? 'What is the recipient address? Paste the full Solana address.'
        : 'How much SOL would you like to send?',
    };
  }

  return {
    status: 'unsupported',
    action: 'unsupported',
    amountSol: null,
    recipient: null,
    explanation:
      'This request was not understood. Try "What is my balance?" or "Send 0.01 SOL to <address>".',
    clarificationQuestion: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Hardening                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Take a schema-valid intent and make it safe to act on.
 *
 * This is where the model loses the right to assert anything consequential:
 *
 * - `requiresConfirmation` is set by this function, never by the model.
 * - a transfer with an invalid address or an unparseable amount is demoted to
 *   "needs_clarification" instead of reaching the preview;
 * - amount and recipient are cleared for every non-transfer action, so a stray
 *   field cannot leak into a later step.
 */
function hardenIntent(
  intent: AiIntent,
  engine: InterpretEngine,
  warnings: string[],
): InterpretResponse {
  const base = {
    explanation: intent.explanation.trim(),
    clarificationQuestion: intent.clarificationQuestion?.trim() || null,
    warnings,
    engine,
  };

  // Read-only actions. They cannot move funds, so they need no approval — but
  // the arguments they carry are still validated here, because a malformed
  // signature or address would otherwise reach a chain lookup unchecked.
  if (intent.action === 'explain_transaction') {
    const check = validateSignature(intent.signature);

    return {
      ...base,
      status: check.ok ? 'ready' : 'needs_clarification',
      action: 'explain_transaction',
      amountSol: null,
      recipient: null,
      signature: check.ok ? check.address : null,
      subjectAddress: null,
      explanation: check.ok ? base.explanation : `I cannot look that up. ${check.reason}`,
      clarificationQuestion: check.ok
        ? base.clarificationQuestion
        : 'Which transaction signature would you like explained?',
      requiresConfirmation: false,
    };
  }

  if (intent.action === 'inspect_address') {
    const check = validateAddress(intent.subjectAddress);

    return {
      ...base,
      status: check.ok ? 'ready' : 'needs_clarification',
      action: 'inspect_address',
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: check.ok ? check.address : null,
      explanation: check.ok ? base.explanation : `I cannot look that up. ${check.reason}`,
      clarificationQuestion: check.ok
        ? base.clarificationQuestion
        : 'Which address would you like me to look up?',
      requiresConfirmation: false,
    };
  }

  if (intent.action !== 'transfer_sol') {
    return {
      ...base,
      status: intent.status,
      action: intent.action,
      amountSol: null,
      recipient: null,
      signature: null,
      subjectAddress: null,
      requiresConfirmation: false,
    };
  }

  const addressCheck = validateAddress(intent.recipient);
  const amountCheck = parseSolToLamports(typeof intent.amountSol === 'string' ? intent.amountSol : '');

  if (!addressCheck.ok || !amountCheck.ok) {
    const problems: string[] = [];
    if (!addressCheck.ok) problems.push(addressCheck.reason);
    if (!amountCheck.ok) problems.push(amountCheck.reason);

    return {
      ...base,
      status: 'needs_clarification',
      action: 'transfer_sol',
      amountSol: amountCheck.ok ? String(intent.amountSol).trim() : null,
      recipient: addressCheck.ok ? addressCheck.address : null,
      signature: null,
      subjectAddress: null,
      // The model's own wording is discarded here. It was written on the
      // assumption that the transfer was going ahead, and repeating "you are
      // sending 0.1 SOL to…" above a question about the missing address would
      // tell the user something untrue.
      explanation: `I cannot prepare that transfer yet. ${problems.join(' ')}`,
      clarificationQuestion:
        base.clarificationQuestion ??
        (!addressCheck.ok
          ? 'What is the recipient address? Paste the full Solana address.'
          : 'How much SOL would you like to send?'),
      warnings: [...warnings, ...problems],
      requiresConfirmation: false,
    };
  }

  return {
    ...base,
    status: 'ready',
    action: 'transfer_sol',
    amountSol: String(intent.amountSol).trim(),
    recipient: addressCheck.address,
    signature: null,
    subjectAddress: null,
    // Always true for a transfer, whatever the model said.
    requiresConfirmation: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Interpret one message.
 *
 * Never throws: a provider failure degrades to the local parser and says so in
 * a warning, because a chat that goes silent is worse than one that explains
 * it is working with less.
 */
export async function interpretMessage(request: InterpretRequest): Promise<InterpretResponse> {
  const engine = selectEngine();
  const contextBlock = buildContextBlock(request.context);
  const warnings: string[] = [];

  if (engine.kind === 'local-parser') {
    warnings.push(
      'No AI provider key is configured on the server, so this reading came from the built-in rule-based parser.',
    );
    return hardenIntent(parseLocally(request.message, request.context), 'local-parser', warnings);
  }

  try {
    const raw =
      engine.kind === 'openai'
        ? await callOpenAi(engine, request.message, contextBlock)
        : await callAnthropic(engine, request.message, contextBlock);

    // Nothing from a model is trusted until it matches the schema exactly.
    const parsed = AiIntentSchema.safeParse(raw);

    if (!parsed.success) {
      warnings.push(
        'The AI response did not match the required format and was rejected. This reading came from the built-in rule-based parser instead.',
      );
      return hardenIntent(parseLocally(request.message, request.context), 'local-parser', warnings);
    }

    return hardenIntent(parsed.data, engine.kind, warnings);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    // Logged server-side only. The message may contain provider detail, so it
    // is summarised rather than forwarded verbatim to the browser.
    console.error('[interpret] AI provider failed:', detail);

    warnings.push(
      'The AI provider could not be reached, so this reading came from the built-in rule-based parser.',
    );
    return hardenIntent(parseLocally(request.message, request.context), 'local-parser', warnings);
  }
}
