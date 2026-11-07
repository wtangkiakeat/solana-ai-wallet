'use client';

import { IconAlert, IconCheck } from './icons';
import type { NetworkCheck } from '@/lib/solana';

type NetworkBadgeProps = {
  network: NetworkCheck | null;
  compact?: boolean;
};

/**
 * The network indicator.
 *
 * It reports the result of an actual `getGenesisHash` call, not the value of a
 * configuration constant, so "Devnet" here means the RPC identified itself as
 * devnet. Until that call returns it says "Checking", because claiming a
 * network before verifying it is exactly the kind of thing this app should not
 * do.
 */
export function NetworkBadge({ network, compact = false }: NetworkBadgeProps) {
  if (network === null) {
    return (
      <span className="chip border-ink-600 bg-ink-800/70 text-haze-400">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-haze-400" />
        Checking network
      </span>
    );
  }

  if (network.status === 'devnet') {
    return (
      <div className={compact ? '' : 'rounded-xl border border-mint-500/30 bg-mint-500/10 p-3'}>
        <span className="chip border-mint-500/40 bg-mint-500/15 text-mint-400">
          <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
          Devnet
        </span>
        {!compact && (
          <p className="mono mt-2 text-[10px] leading-relaxed break-all text-haze-500">
            genesis {network.genesisHash.slice(0, 12)}…
          </p>
        )}
      </div>
    );
  }

  if (network.status === 'wrong-network') {
    return (
      <div className={compact ? '' : 'rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3'}>
        <span className="chip border-rose-accent/50 bg-rose-accent/15 text-rose-accent">
          <IconAlert className="h-3 w-3" />
          Wrong network
        </span>
        {!compact && (
          <p className="mt-2 text-[11px] leading-relaxed text-rose-accent/90">
            The RPC reports {network.name}. Transfers are disabled. Point
            NEXT_PUBLIC_SOLANA_RPC_URL at a devnet endpoint.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-amber-accent/40 bg-amber-accent/10 p-3'}>
      <span className="chip border-amber-accent/50 bg-amber-accent/15 text-amber-accent">
        <IconAlert className="h-3 w-3" />
        RPC unreachable
      </span>
      {!compact && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-accent/90">{network.message}</p>
      )}
    </div>
  );
}

/** A small inline "verified on chain" marker, used to label chain-read figures. */
export function VerifiedTag({ label = 'Verified on chain' }: { label?: string }) {
  return (
    <span className="chip border-mint-500/35 bg-mint-500/10 text-mint-400">
      <IconCheck className="h-3 w-3" />
      {label}
    </span>
  );
}

/** A small inline marker for anything a language model produced. */
export function AiTag({ engine }: { engine?: string }) {
  const isModel = engine === 'openai' || engine === 'anthropic';

  return (
    <span
      className={`chip ${
        isModel
          ? 'border-violet-accent/40 bg-violet-accent/10 text-violet-accent'
          : 'border-ink-600 bg-ink-800/80 text-haze-400'
      }`}
      title={
        isModel
          ? 'Written by a language model. Not a statement of fact about the chain.'
          : 'Produced by the built-in rule-based parser, with no language model involved.'
      }
    >
      {isModel ? 'AI explanation' : 'Local parser'}
    </span>
  );
}
