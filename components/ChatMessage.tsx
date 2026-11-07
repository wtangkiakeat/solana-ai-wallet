'use client';

import type { ChatMessage as ChatMessageModel } from '@/types/chat';
import { IconAlert, IconSparkle } from './icons';
import { AiTag, VerifiedTag } from './NetworkBadge';

/**
 * One message in the conversation.
 *
 * The assistant's prose and the chain-read figures are rendered in visibly
 * different blocks, and each carries its own tag. A judge should be able to
 * glance at the screen and tell which numbers came from Solana and which
 * sentences came from a model.
 */
export function ChatMessage({ message }: { message: ChatMessageModel }) {
  if (message.role === 'user') {
    return (
      <div className="flex animate-rise justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600/85 px-4 py-2.5 text-sm text-white">
          {message.text}
        </div>
      </div>
    );
  }

  const toneStyles =
    message.tone === 'error'
      ? 'border-rose-accent/35 bg-rose-accent/8'
      : message.tone === 'warning'
        ? 'border-amber-accent/35 bg-amber-accent/8'
        : 'border-ink-700/70 bg-ink-800/60';

  return (
    <div className="flex animate-rise gap-2.5">
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
        style={{ backgroundImage: 'linear-gradient(135deg, #4c7dff, #9b6bff)' }}
        aria-hidden="true"
      >
        <IconSparkle className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 max-w-[85%] space-y-2.5">
        <div className={`rounded-2xl rounded-tl-md border px-4 py-3 ${toneStyles}`}>
          {/* A tag only where something produced the text. The greeting and
              the app's own confirmations are not AI output, and labelling
              them as such would misattribute the app's own words. */}
          {(message.tone === 'error' || message.engine) && (
            <div className="flex flex-wrap items-center gap-1.5 pb-2">
              {message.tone === 'error' ? (
                <span className="chip border-rose-accent/50 bg-rose-accent/15 text-rose-accent">
                  <IconAlert className="h-3 w-3" />
                  Blocked
                </span>
              ) : (
                <AiTag engine={message.engine} />
              )}
            </div>
          )}

          <p className="text-sm leading-relaxed whitespace-pre-line text-haze-200">{message.text}</p>
        </div>

        {message.facts && message.facts.length > 0 && (
          <div className="rounded-2xl border border-mint-500/25 bg-mint-500/[0.07] px-4 py-3">
            <div className="pb-2">
              <VerifiedTag label="Read from Solana Devnet" />
            </div>
            <dl className="space-y-1.5">
              {message.facts.map((fact) => (
                <div key={fact.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-haze-400">
                    {fact.label}
                  </dt>
                  <dd className="mono text-sm text-haze-100">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
