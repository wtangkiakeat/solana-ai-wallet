/**
 * Exact decimal <-> lamport conversion.
 *
 * SOL amounts arrive as strings (from a language model, or typed by a user) and
 * are converted straight to BigInt lamports. No value ever passes through a
 * JavaScript `number`, so 0.1 + 0.2 style rounding errors are impossible.
 */

import { LAMPORTS_PER_SOL, SOL_DECIMALS } from './constants';

export type ParseResult =
  | { ok: true; lamports: bigint }
  | { ok: false; reason: string };

/** Matches a plain decimal number: "1", "0.1", ".5", "12.000000001". No sign, no exponent. */
const DECIMAL_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Convert a decimal SOL string into integer lamports.
 *
 * Rejects anything that is not a plain positive decimal, and anything with more
 * than 9 decimal places, rather than silently rounding it.
 */
export function parseSolToLamports(input: string): ParseResult {
  const raw = typeof input === 'string' ? input.trim() : '';

  if (raw === '') {
    return { ok: false, reason: 'No amount was given.' };
  }
  if (raw.startsWith('-')) {
    return { ok: false, reason: 'The amount cannot be negative.' };
  }
  if (/[eE]/.test(raw)) {
    return { ok: false, reason: 'Scientific notation is not accepted. Write the amount in full, for example 0.000000001.' };
  }
  if (raw.includes(',')) {
    return { ok: false, reason: 'Remove the commas from the amount, for example write 1000.5 instead of 1,000.5.' };
  }
  if (!DECIMAL_PATTERN.test(raw)) {
    return { ok: false, reason: `"${raw}" is not a valid SOL amount.` };
  }

  const [whole, fraction = ''] = raw.split('.');

  if (fraction.length > SOL_DECIMALS) {
    return {
      ok: false,
      reason: `SOL has at most ${SOL_DECIMALS} decimal places. "${raw}" has ${fraction.length}.`,
    };
  }

  // Pad the fractional part to exactly 9 digits, then read the whole thing as
  // one integer. "0.1" -> whole "0", fraction "100000000" -> 100000000 lamports.
  const paddedFraction = fraction.padEnd(SOL_DECIMALS, '0');
  const lamports = BigInt(whole === '' ? '0' : whole) * LAMPORTS_PER_SOL + BigInt(paddedFraction);

  if (lamports === 0n) {
    return { ok: false, reason: 'The amount must be greater than zero.' };
  }

  return { ok: true, lamports };
}

/**
 * Render integer lamports as a decimal SOL string.
 *
 * Trailing zeros are trimmed so 100000000 becomes "0.1", not "0.100000000".
 */
export function formatSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const absolute = negative ? -lamports : lamports;

  const whole = absolute / LAMPORTS_PER_SOL;
  const fraction = absolute % LAMPORTS_PER_SOL;

  const sign = negative ? '-' : '';

  if (fraction === 0n) {
    return `${sign}${whole}`;
  }

  const fractionText = fraction.toString().padStart(SOL_DECIMALS, '0').replace(/0+$/, '');
  return `${sign}${whole}.${fractionText}`;
}

/** Render lamports as SOL with a fixed number of decimals, for compact display. */
export function formatSolFixed(lamports: bigint, decimals = 4): string {
  const exact = formatSol(lamports);
  const asNumber = Number(exact);
  if (!Number.isFinite(asNumber)) return exact;
  // Display only. Every decision in the app is made on the BigInt value.
  return asNumber.toFixed(decimals);
}

/** Shorten an address for display: "9xQe...Aa71". */
export function shortenAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
