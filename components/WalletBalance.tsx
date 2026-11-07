'use client';

import { formatSol, formatSolFixed } from '@/lib/amounts';
import { IconExternal, IconRefresh } from './icons';
import { VerifiedTag } from './NetworkBadge';

type WalletBalanceProps = {
  address: string | null;
  balanceLamports: bigint | null;
  maxSendableLamports: bigint | null;
  feeLamports: bigint;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
};

/**
 * The balance card.
 *
 * Every figure here is read from Solana with `getBalance` and carries the
 * "verified on chain" tag. When the read fails the card says so and shows
 * nothing — there is no placeholder number, because a plausible-looking fake
 * balance in a wallet is worse than an empty space.
 */
export function WalletBalance({
  address,
  balanceLamports,
  maxSendableLamports,
  feeLamports,
  isLoading,
  error,
  onRefresh,
}: WalletBalanceProps) {
  const hasBalance = balanceLamports !== null;
  const needsFunding = hasBalance && balanceLamports === 0n;

  return (
    <section
      className="panel relative overflow-hidden p-5"
      style={{
        backgroundImage:
          'linear-gradient(140deg, rgba(76,125,255,0.14), rgba(155,107,255,0.07) 55%, transparent)',
      }}
      aria-label="Wallet balance"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="panel-heading">Wallet balance</p>
          <p className="mt-1 text-[11px] text-haze-500">Solana Devnet</p>
        </div>

        <div className="flex items-center gap-2">
          {hasBalance && <VerifiedTag />}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || !address}
            className="rounded-lg border border-ink-600 bg-ink-800/70 p-2 text-haze-400 transition-colors
              hover:text-haze-100 disabled:opacity-40"
            aria-label="Refresh balance"
            title="Refresh balance"
          >
            <IconRefresh className={`h-3.5 w-3.5 ${isLoading ? 'animate-pulse-dot' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-5">
        {!address ? (
          <p className="text-sm text-haze-400">
            Connect a wallet to read its balance from the network.
          </p>
        ) : error ? (
          <div>
            <p className="text-2xl font-semibold text-haze-500">—</p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-amber-accent">{error}</p>
          </div>
        ) : !hasBalance ? (
          <div className="h-10 w-40 animate-pulse-dot rounded-lg bg-ink-700/70" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-haze-100">
              {formatSolFixed(balanceLamports, 4)}
            </span>
            <span className="text-lg font-semibold text-haze-400">SOL</span>
            <span className="mono ml-1 text-[11px] text-haze-500">
              {balanceLamports.toString()} lamports
            </span>
          </div>
        )}
      </div>

      {hasBalance && !error && (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-700/60 pt-4">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-haze-500">
              Safe to send
            </dt>
            <dd className="mono mt-1 text-sm text-haze-200">
              {maxSendableLamports !== null ? `${formatSol(maxSendableLamports)} SOL` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-haze-500">
              Fee per transfer
            </dt>
            <dd className="mono mt-1 text-sm text-haze-200">≈ {formatSol(feeLamports)} SOL</dd>
          </div>
        </dl>
      )}

      {needsFunding && (
        <div className="mt-4 border-t border-ink-700/60 pt-4">
          {/* Solana closed the `requestAirdrop` RPC method on devnet — the
              public endpoint answers it with "The RPC faucet is closed on this
              cluster". The web faucet is the only route left, so the card links
              there rather than offering a button that cannot work. */}
          <p className="text-xs leading-relaxed text-haze-400">
            This wallet holds no devnet SOL. The devnet RPC faucet is closed, so top it up at the
            web faucet, then refresh.
          </p>
          <a
            href="https://faucet.solana.com"
            target="_blank"
            rel="noreferrer noopener"
            className="btn-ghost mt-3"
          >
            Open the Solana devnet faucet
            <IconExternal className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </section>
  );
}
