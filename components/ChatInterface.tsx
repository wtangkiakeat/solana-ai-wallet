'use client';

import { useEffect, useRef, useState } from 'react';

import type { InterpretEngine } from '@/lib/validation';
import type { ChatMessage as ChatMessageModel } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { IconSend } from './icons';

type ChatInterfaceProps = {
  messages: ChatMessageModel[];
  onSend: (text: string) => void;
  isBusy: boolean;
  /** Set when input must be blocked outright, with the reason to show. */
  blockedReason: string | null;
  /** Shown above the input without disabling it — a nudge, not a wall. */
  hint: string | null;
  engine: InterpretEngine | null;
};

/**
 * Example prompts. These are interface previews, not transactions: none of them
 * contains an address, so none can be submitted without the user supplying one.
 */
const SUGGESTIONS = [
  'What is my balance?',
  'How much SOL can I safely send?',
  'Send 0.01 SOL to',
  'What is 1 SOL worth in dollars?',
];

export function ChatInterface({
  messages,
  onSend,
  isBusy,
  blockedReason,
  hint,
  engine,
}: ChatInterfaceProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isBusy]);

  function submit() {
    const text = draft.trim();
    if (text === '' || isBusy || blockedReason) return;
    setDraft('');
    onSend(text);
  }

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="AI assistant">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 px-5 py-3.5">
        <div>
          <p className="panel-heading">AI Assistant</p>
          <p className="mt-0.5 text-[11px] text-haze-500">
            Describe a transfer in plain English. You approve and sign every one.
          </p>
        </div>
        {engine && (
          <span
            className="chip border-ink-600 bg-ink-800/80 text-haze-400"
            title={
              engine === 'local-parser'
                ? 'No AI provider key is configured, so messages are read by the built-in rule-based parser.'
                : `Messages are interpreted by ${engine}.`
            }
          >
            {engine === 'local-parser' ? 'Engine: local parser' : `Engine: ${engine}`}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isBusy && (
          <div className="flex items-center gap-2 pl-10 text-xs text-haze-400">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400" />
              <span
                className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400"
                style={{ animationDelay: '0.2s' }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400"
                style={{ animationDelay: '0.4s' }}
              />
            </span>
            Reading your message…
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-ink-700/60 px-5 py-3.5">
        {messages.length <= 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={isBusy || blockedReason !== null}
                onClick={() => {
                  setDraft(suggestion);
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1.5 text-[11px]
                  text-haze-400 transition-colors hover:border-brand-500/50 hover:text-haze-100
                  disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {blockedReason ? (
          <p className="mb-2.5 text-[11px] leading-snug text-amber-accent">{blockedReason}</p>
        ) : (
          hint && <p className="mb-2.5 text-[11px] leading-snug text-haze-500">{hint}</p>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={isBusy || blockedReason !== null}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter makes a new line.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Send 0.01 SOL to 9xQe…"
            aria-label="Message to the assistant"
            className="field max-h-32 min-h-[46px] resize-y"
          />
          <button
            type="button"
            onClick={submit}
            disabled={isBusy || draft.trim() === '' || blockedReason !== null}
            className="btn-primary h-[46px] px-4"
            aria-label="Send message"
          >
            <IconSend className="h-4 w-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </section>
  );
}
