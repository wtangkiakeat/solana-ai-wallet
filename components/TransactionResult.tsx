'use client';

import { formatSol, shortenAddress } from '@/lib/amounts';
import { explorerTxUrl } from '@/lib/constants';
import type { TransferOutcome } from '@/types/transaction';
import { IconAlert, IconCheck, IconExternal } from './icons';
import { VerifiedTag } from './NetworkBadge';

type TransactionResultProps = {
  outcome: TransferOutcome;
  onDismiss: () => void;
};

/**
 * The outcome panel.
 *
 * "Confirmed" appears only after the send call has resolved, which includes the
 * network confirming the signature. A submitted-but-unconfirmed transaction is
 * reported as a failure with its signature, so the user can check it on
 * Explorer themselves rather than be told it worked.
 */
export function TransactionResult({ outcome, onDismiss }: TransactionResultProps) {
  if (outcome.kind === 'confirmed') {
    return (
      <section
        className="panel animate-rise overflow-hidden"
        aria-label="Transaction confirmed"
        style={{
          backgroundImage:
            'linear-gradient(150deg, rgba(46,230,168,0.14), rgba(46,230,168,0.03) 60%, transparent)',
        }}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint-500/20 text-mint-400">
            <IconCheck className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-haze-100">Transfer confirmed</p>
              <VerifiedTag label="Confirmed by the network" />
            </div>

            <p className="mt-1 text-xs text-haze-400">
              {formatSol(outcome.lamports)} SOL sent to{' '}
              <span className="mono">{shortenAddress(outcome.recipient, 5, 5)}</span> on Devnet.
            </p>

            <div className="mt-3 rounded-xl border border-ink-700/70 bg-ink-900/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-haze-500">
                Transaction signature
              </p>
              <p className="mono mt-1 break-all text-[11px] text-haze-200">{outcome.signature}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={explorerTxUrl(outcome.signature)}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-primary"
              >
                View on Solana Explorer
                <IconExternal className="h-3.5 w-3.5" />
              </a>
              <button type="button" className="btn-ghost" onClick={onDismiss}>
                Done
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (outcome.kind === 'rejected') {
    return (
      <section className="panel animate-rise px-5 py-4" aria-label="Transaction cancelled">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-700 text-haze-400">
            <IconAlert className="h-4.5 w-4.5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-haze-100">Not signed</p>
            <p className="mt-1 text-xs leading-relaxed text-haze-400">
              You declined the signature request in your wallet, so nothing was sent and no fee was
              charged.
            </p>
            <button type="button" className="btn-ghost mt-3" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="panel animate-rise overflow-hidden px-5 py-4"
      aria-label="Transaction failed"
      style={{
        backgroundImage: 'linear-gradient(150deg, rgba(255,107,129,0.12), transparent 60%)',
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-accent/15 text-rose-accent">
          <IconAlert className="h-4.5 w-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-haze-100">Transfer failed</p>
          <p className="mt-1 text-xs leading-relaxed break-words text-rose-accent/90">
            {outcome.message}
          </p>

          {outcome.signature && (
            <>
              <div className="mt-3 rounded-xl border border-ink-700/70 bg-ink-900/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-haze-500">
                  Signature submitted — check its real status
                </p>
                <p className="mono mt-1 break-all text-[11px] text-haze-200">{outcome.signature}</p>
              </div>
              <a
                href={explorerTxUrl(outcome.signature)}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-ghost mt-3 mr-2"
              >
                Check on Explorer
                <IconExternal className="h-3.5 w-3.5" />
              </a>
            </>
          )}

          <button type="button" className="btn-ghost mt-3" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
