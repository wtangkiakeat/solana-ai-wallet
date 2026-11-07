'use client';

import { formatSol } from '@/lib/amounts';
import { CLUSTER, explorerAddressUrl } from '@/lib/constants';
import type { InstructionSummary, PendingTransfer } from '@/types/transaction';
import { IconAlert, IconExternal, IconShield } from './icons';
import { AiTag, VerifiedTag } from './NetworkBadge';

type TransactionPreviewProps = {
  transfer: PendingTransfer;
  engine?: string;
  isSigning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The approval step.
 *
 * Nothing reaches the wallet until the button in here is pressed. Every figure
 * shown has already been through `validateTransfer`, and the amounts come
 * straight from BigInt lamports, so what is on screen is exactly what will be
 * signed.
 */
export function TransactionPreview({
  transfer,
  engine,
  isSigning,
  onConfirm,
  onCancel,
}: TransactionPreviewProps) {
  return (
    <section
      className="panel animate-rise overflow-hidden"
      aria-label="Transaction confirmation"
      style={{
        backgroundImage:
          'linear-gradient(160deg, rgba(155,107,255,0.12), rgba(76,125,255,0.05) 60%, transparent)',
      }}
    >
      <header className="flex items-center gap-2 border-b border-ink-700/60 px-5 py-3.5">
        <IconShield className="h-4 w-4 text-brand-400" />
        <div>
          <p className="panel-heading text-haze-300">Review and approve</p>
          <p className="mt-0.5 text-[11px] text-haze-500">
            Nothing is sent until you approve it here and sign in your wallet.
          </p>
        </div>
      </header>

      <div className="px-5 py-1">
        <div className="detail-row">
          <dt className="detail-label">Recipient</dt>
          <dd className="detail-value">
            <span className="mono block break-all text-xs text-haze-100">{transfer.recipient}</span>
            <a
              href={explorerAddressUrl(transfer.recipient)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300"
            >
              View on Explorer
              <IconExternal className="h-3 w-3" />
            </a>
          </dd>
        </div>

        <div className="detail-row">
          <dt className="detail-label">Amount</dt>
          <dd className="detail-value">
            <span className="text-base font-semibold text-haze-100">
              {formatSol(transfer.lamports)} SOL
            </span>
            <span className="mono block text-[11px] text-haze-500">
              {transfer.lamports.toString()} lamports
            </span>
          </dd>
        </div>

        <div className="detail-row">
          <dt className="detail-label">Network fee</dt>
          <dd className="detail-value">
            <span className="mono text-sm text-haze-100">
              {transfer.feeSource === 'rpc' ? '' : '≈ '}
              {formatSol(transfer.feeLamports)} SOL
            </span>
            <span className="block text-[11px] text-haze-500">
              {transfer.feeSource === 'rpc'
                ? 'Priced by the network for this exact transaction'
                : 'Base signature fee — the network could not price this message'}
            </span>
          </dd>
        </div>

        <div className="detail-row">
          <dt className="detail-label">Network</dt>
          <dd className="detail-value">
            <span className="chip border-mint-500/40 bg-mint-500/15 text-mint-400">
              Solana {CLUSTER}
            </span>
          </dd>
        </div>

        <div className="detail-row">
          <dt className="detail-label">Total</dt>
          <dd className="detail-value">
            <span className="text-base font-bold text-haze-100">
              {formatSol(transfer.totalLamports)} SOL
            </span>
            <span className="block text-[11px] text-haze-500">Amount plus network fee</span>
          </dd>
        </div>
      </div>

      <div className="space-y-2.5 px-5 pb-4 pt-3">
        {/* What the chain itself says would happen. Kept visually separate from
            the AI's prose below, and from the app's own intent above. */}
        <SimulationPanel transfer={transfer} />

        <InstructionPanel instructions={transfer.instructions} />

        <div className="rounded-xl border border-ink-700/70 bg-ink-900/50 p-3">
          <div className="pb-1.5">
            <AiTag engine={engine} />
          </div>
          <p className="text-xs leading-relaxed text-haze-300">{transfer.explanation}</p>
        </div>

        {transfer.warnings.map((warning) => (
          <div
            key={warning}
            className="flex items-start gap-2 rounded-xl border border-amber-accent/35 bg-amber-accent/8 p-3"
          >
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-accent" />
            <p className="text-xs leading-relaxed text-amber-accent">{warning}</p>
          </div>
        ))}
      </div>

      <footer className="flex flex-col-reverse gap-2 border-t border-ink-700/60 px-5 py-4 sm:flex-row">
        <button type="button" className="btn-ghost sm:flex-1" onClick={onCancel} disabled={isSigning}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-confirm sm:flex-[1.4]"
          onClick={onConfirm}
          disabled={isSigning}
        >
          {isSigning ? 'Waiting for your wallet…' : `Approve and sign ${formatSol(transfer.lamports)} SOL`}
        </button>
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

/** Render a signed lamport delta as "+0.01 SOL" or "-0.010005 SOL". */
function signedSol(delta: bigint): string {
  const sign = delta < 0n ? '\u2212' : '+';
  return `${sign}${formatSol(delta < 0n ? -delta : delta)} SOL`;
}

/**
 * What the network said when the transaction was run against it, unsigned.
 *
 * This is the only block in the preview reporting the chain's own verdict
 * rather than the app's intent, so it carries the "verified" treatment. A
 * simulation that could not run says exactly that, and is never presented as
 * a pass.
 */
function SimulationPanel({ transfer }: { transfer: PendingTransfer }) {
  const { simulation } = transfer;

  if (simulation.kind === 'unavailable' || simulation.kind === 'inconclusive') {
    const inconclusive = simulation.kind === 'inconclusive';

    return (
      <div className="rounded-xl border border-amber-accent/35 bg-amber-accent/8 p-3">
        <div className="flex items-start gap-2">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-accent" />
          <div>
            <p className="text-xs font-semibold text-amber-accent">
              {inconclusive ? 'Simulation inconclusive' : 'Not simulated'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-accent/90">
              {simulation.reason}{' '}
              {inconclusive
                ? 'Every other check passed, so this is yours to decide — but treat it as unproven.'
                : 'The checks above still passed, but the network has not confirmed what this transaction would do.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // A failed simulation never reaches the preview; it is blocked earlier.
  if (simulation.kind !== 'succeeded') return null;

  return (
    <div className="rounded-xl border border-mint-500/30 bg-mint-500/[0.07] p-3">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <VerifiedTag label="Simulated on Devnet" />
        <span className="text-[11px] text-haze-400">before signing</span>
      </div>

      <p className="text-[11px] leading-relaxed text-haze-400">
        The network ran this transaction without signing it. These are the balance changes it
        reported:
      </p>

      <dl className="mt-2.5 space-y-1.5">
        {simulation.senderDelta !== null && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-haze-400">
              Your wallet
            </dt>
            <dd className="mono text-sm font-semibold text-rose-accent">
              {signedSol(simulation.senderDelta)}
            </dd>
          </div>
        )}
        {simulation.recipientDelta !== null && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-haze-400">
              Recipient
            </dt>
            <dd className="mono text-sm font-semibold text-mint-400">
              {signedSol(simulation.recipientDelta)}
            </dd>
          </div>
        )}
        {simulation.computeUnits !== null && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-haze-400">
              Compute units
            </dt>
            <dd className="mono text-sm text-haze-200">{simulation.computeUnits.toString()}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Instruction disclosure                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything the transaction actually contains.
 *
 * A SOL transfer should be exactly one System Program instruction. Showing the
 * list lets the user verify that themselves rather than trusting the app's
 * summary: "what am I actually signing?", answered literally.
 */
function InstructionPanel({ instructions }: { instructions: InstructionSummary[] }) {
  if (instructions.length === 0) return null;

  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-haze-500">
        What you are signing &mdash; {instructions.length}{' '}
        {instructions.length === 1 ? 'instruction' : 'instructions'}
      </p>

      <ol className="mt-2 space-y-2">
        {instructions.map((instruction, index) => (
          <li key={`${instruction.programAddress}-${index}`} className="flex gap-2">
            <span className="mono mt-0.5 text-[10px] text-haze-500">{index + 1}</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-haze-200">
                {instruction.programName ?? 'Unknown program'}
                {instruction.description && (
                  <span className="font-normal text-haze-400"> &mdash; {instruction.description}</span>
                )}
              </p>
              <p className="mono mt-0.5 break-all text-[10px] text-haze-500">
                {instruction.programAddress}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
