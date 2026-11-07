'use client';

/**
 * The direct send form.
 *
 * This is the floor the whole app stands on: a wallet must work without the
 * assistant understanding anything. Typing an address and an amount here goes
 * through exactly the same path a chat message does — validation, simulation,
 * preview, your signature — so the AI is a shortcut, never a toll gate.
 */

import { useState } from 'react';

import { formatSol } from '@/lib/amounts';
import { maxSendableLamports, validateAddress } from '@/lib/validation';
import { parseSolToLamports } from '@/lib/amounts';
import { IconSend } from './icons';

type SendFormProps = {
  /** Hands the raw strings to the shared pipeline; it does the real checking. */
  onSubmit: (recipient: string, amountSol: string) => void;
  disabled: boolean;
  isBusy: boolean;
  balanceLamports: bigint | null;
  feeLamports: bigint;
};

export function SendForm({
  onSubmit,
  disabled,
  isBusy,
  balanceLamports,
  feeLamports,
}: SendFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);

  // Inline feedback only. These checks exist so the user is told early, not so
  // the transfer is trusted — lib/validation.ts re-runs all of it, plus the
  // balance, fee, network and simulation checks, before anything is signed.
  const addressCheck = recipient.trim() === '' ? null : validateAddress(recipient);
  const amountCheck = amount.trim() === '' ? null : parseSolToLamports(amount);

  const addressError = touched && addressCheck && !addressCheck.ok ? addressCheck.reason : null;
  const amountError = touched && amountCheck && !amountCheck.ok ? amountCheck.reason : null;

  const ready =
    addressCheck?.ok === true && amountCheck?.ok === true && !disabled && !isBusy;

  const spendable =
    balanceLamports === null ? null : maxSendableLamports(balanceLamports, feeLamports);

  function submit() {
    setTouched(true);
    if (!addressCheck?.ok || !amountCheck?.ok || disabled || isBusy) return;
    onSubmit(recipient.trim(), amount.trim());
  }

  return (
    <section className="panel p-5" aria-label="Send SOL">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="panel-heading">Send SOL</p>
          <p className="mt-0.5 text-[11px] text-haze-500">
            The direct way. Same checks, same approval step.
          </p>
        </div>
        {spendable !== null && (
          <button
            type="button"
            disabled={disabled || isBusy || spendable <= 0n}
            onClick={() => {
              setAmount(formatSol(spendable));
              setTouched(true);
            }}
            className="rounded-lg border border-ink-600 bg-ink-800/70 px-2.5 py-1.5 text-[11px]
              font-medium text-haze-400 transition-colors hover:text-haze-100 disabled:opacity-40"
          >
            Max {formatSol(spendable)}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="send-recipient" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-haze-400">
            Recipient address
          </label>
          <input
            id="send-recipient"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={recipient}
            disabled={disabled}
            onChange={(event) => setRecipient(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
            aria-invalid={addressError !== null}
            className={`field mono text-xs ${addressError ? 'border-rose-accent' : ''}`}
          />
          {addressError && (
            <p className="mt-1.5 text-[11px] leading-snug text-rose-accent">{addressError}</p>
          )}
        </div>

        <div>
          <label htmlFor="send-amount" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-haze-400">
            Amount in SOL
          </label>
          <input
            id="send-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            disabled={disabled}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="0.01"
            aria-invalid={amountError !== null}
            className={`field mono ${amountError ? 'border-rose-accent' : ''}`}
          />
          {amountError && (
            <p className="mt-1.5 text-[11px] leading-snug text-rose-accent">{amountError}</p>
          )}
        </div>

        <button type="button" className="btn-primary mt-1" onClick={submit} disabled={!ready}>
          <IconSend className="h-4 w-4" />
          {isBusy ? 'Preparing…' : 'Review transfer'}
        </button>

        <p className="text-[11px] leading-relaxed text-haze-500">
          You will see the full details, a network-priced fee and an on-chain simulation before
          anything is signed.
        </p>
      </div>
    </section>
  );
}
