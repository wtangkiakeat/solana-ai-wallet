'use client';

import { formatSol, shortenAddress } from '@/lib/amounts';
import { explorerTxUrl } from '@/lib/constants';
import type { ActivityEntry, TransactionRecord } from '@/types/transaction';
import { IconExternal, IconList } from './icons';
import { VerifiedTag } from './NetworkBadge';

type TransactionHistoryProps = {
  records: TransactionRecord[];
  /** Activity read back from the chain, when the user has asked for it. */
  activity?: ActivityEntry[];
  /** `true` on the dashboard, where only the few most recent rows are shown. */
  compact?: boolean;
};

const STATUS_STYLES: Record<TransactionRecord['status'], string> = {
  confirmed: 'border-mint-500/40 bg-mint-500/15 text-mint-400',
  failed: 'border-rose-accent/40 bg-rose-accent/15 text-rose-accent',
  rejected: 'border-ink-600 bg-ink-800 text-haze-400',
};

const STATUS_LABELS: Record<TransactionRecord['status'], string> = {
  confirmed: 'Confirmed',
  failed: 'Failed',
  rejected: 'Not signed',
};

/**
 * Transfers made in this browser session.
 *
 * Deliberately not seeded with sample rows. An empty list is the honest state
 * for a fresh session, and a wallet that invents transaction history would be
 * worse than one that shows none.
 */
export function TransactionHistory({
  records,
  activity = [],
  compact = false,
}: TransactionHistoryProps) {
  const rows = compact ? records.slice(0, 4) : records;
  const chainRows = compact ? activity.slice(0, 3) : activity;

  return (
    <section className="panel" aria-label="Transaction history">
      <header className="flex items-center justify-between gap-3 border-b border-ink-700/60 px-5 py-3.5">
        <div>
          <p className="panel-heading">{compact ? 'Recent transactions' : 'Transaction history'}</p>
          <p className="mt-0.5 text-[11px] text-haze-500">
            Transfers made in this session, with their real signatures
          </p>
        </div>
        {records.length > 0 && (
          <span className="chip border-ink-600 bg-ink-800/80 text-haze-400">{records.length}</span>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-haze-500">
            <IconList className="h-4.5 w-4.5" />
          </span>
          <p className="text-sm text-haze-400">No transfers yet</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-haze-500">
            Ask the assistant to send some SOL. Confirmed transfers will appear here with a link to
            Solana Explorer.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-700/50">
          {rows.map((record) => (
            <li key={record.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-haze-100">
                    {formatSol(record.lamports)} SOL
                  </span>
                  <span className={`chip ${STATUS_STYLES[record.status]}`}>
                    {STATUS_LABELS[record.status]}
                  </span>
                </div>
                <p className="mono mt-1 truncate text-[11px] text-haze-500">
                  to {shortenAddress(record.recipient, 6, 6)}
                  {' · '}
                  {new Date(record.at).toLocaleTimeString()}
                </p>
                {record.detail && (
                  <p className="mt-1 text-[11px] leading-snug text-haze-400">{record.detail}</p>
                )}
              </div>

              {record.signature && (
                <a
                  href={explorerTxUrl(record.signature)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 rounded-lg border border-ink-600 bg-ink-800/70 p-2 text-haze-400
                    transition-colors hover:text-haze-100"
                  aria-label="View transaction on Solana Explorer"
                  title="View on Solana Explorer"
                >
                  <IconExternal className="h-3.5 w-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {chainRows.length > 0 && (
        <div className="border-t border-ink-700/60">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <p className="panel-heading">On chain</p>
            <VerifiedTag label="Read from Devnet" />
          </div>
          <ul className="divide-y divide-ink-700/50">
            {chainRows.map((entry) => (
              <li key={entry.signature} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-haze-100">
                      {entry.delta === null
                        ? '—'
                        : `${entry.delta < 0n ? '−' : '+'}${formatSol(entry.delta < 0n ? -entry.delta : entry.delta)} SOL`}
                    </span>
                    <span
                      className={`chip ${
                        entry.error
                          ? 'border-rose-accent/40 bg-rose-accent/15 text-rose-accent'
                          : 'border-mint-500/40 bg-mint-500/15 text-mint-400'
                      }`}
                    >
                      {entry.error ? 'Failed' : 'Confirmed'}
                    </span>
                  </div>
                  <p className="mono mt-1 truncate text-[11px] text-haze-500">
                    {shortenAddress(entry.signature, 8, 8)}
                    {entry.blockTime !== null && ` · ${new Date(entry.blockTime * 1000).toLocaleString()}`}
                  </p>
                </div>

                <a
                  href={explorerTxUrl(entry.signature)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 rounded-lg border border-ink-600 bg-ink-800/70 p-2 text-haze-400
                    transition-colors hover:text-haze-100"
                  aria-label="View transaction on Solana Explorer"
                  title="View on Solana Explorer"
                >
                  <IconExternal className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
