'use client';

import { IconGrid, IconList, IconSettings, IconSparkle } from './icons';
import { NetworkBadge } from './NetworkBadge';
import type { NetworkCheck } from '@/lib/solana';

export type NavView = 'dashboard' | 'assistant' | 'history' | 'settings';

const NAV_ITEMS: { id: NavView; label: string; icon: (p: { className?: string }) => React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconGrid },
  { id: 'assistant', label: 'AI Assistant', icon: IconSparkle },
  { id: 'history', label: 'Transaction History', icon: IconList },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

type SidebarProps = {
  view: NavView;
  onViewChange: (view: NavView) => void;
  network: NetworkCheck | null;
  historyCount: number;
};

/**
 * Navigation. A column on a large screen; a horizontal scrolling strip on a
 * phone, where a 240px sidebar would leave nothing for the content.
 */
export function Sidebar({ view, onViewChange, network, historyCount }: SidebarProps) {
  return (
    <aside
      className="flex shrink-0 flex-col gap-6 border-b border-ink-700/60 bg-ink-900/60 px-4 py-4
        backdrop-blur-sm lg:h-dvh lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-6"
    >
      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:gap-6">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{ backgroundImage: 'linear-gradient(135deg, #4c7dff, #9b6bff)' }}
          >
            <IconSparkle className="h-4.5 w-4.5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-haze-100">Solana AI Wallet</p>
            <p className="text-[11px] text-haze-500">Natural-language transfers</p>
          </div>
        </div>

        <div className="lg:hidden">
          <NetworkBadge network={network} compact />
        </div>
      </div>

      <nav aria-label="Sections">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;

            return (
              <li key={item.id} className="shrink-0 lg:w-full">
                <button
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium
                    transition-colors ${
                      active
                        ? 'bg-brand-500/15 text-haze-100 ring-1 ring-inset ring-brand-500/40'
                        : 'text-haze-400 hover:bg-ink-800/70 hover:text-haze-100'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.id === 'history' && historyCount > 0 && (
                    <span className="ml-auto rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-haze-300">
                      {historyCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto hidden lg:block">
        <NetworkBadge network={network} />
        <p className="mt-3 text-[11px] leading-relaxed text-haze-500">
          This app signs with your wallet only, and never asks for a seed phrase or private key.
        </p>
      </div>
    </aside>
  );
}
