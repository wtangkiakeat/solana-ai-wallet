'use client';

import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets,
  useWalletStatus,
} from '@solana/kit-plugin-wallet/react';
import { useEffect, useState } from 'react';

import { useAppClient } from '@/app/providers';
import { shortenAddress } from '@/lib/amounts';
import { explorerAddressUrl } from '@/lib/constants';
import { IconCopy, IconExternal, IconWallet } from './icons';

/**
 * Wallet connection, through the Wallet Standard.
 *
 * The app never sees a key. It discovers wallets the browser has registered,
 * asks the chosen one to connect, and from then on holds only a public address
 * and a signer object that delegates every signature back to the wallet.
 */
export function WalletConnect() {
  const client = useAppClient();

  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const status = useWalletStatus(client);
  const isReady = useIsWalletReady(client);

  const connect = useConnect(client);
  const disconnect = useDisconnect(client);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Wallet discovery is a browser-only fact: the server cannot know which
   * extensions are installed. Rendering the real state before this flag flips
   * makes the first client render differ from the server HTML, which React
   * reports as a hydration mismatch. Holding one frame costs nothing.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const busy = connect.isRunning || disconnect.isRunning || !isReady;

  if (!mounted) {
    return (
      <button type="button" className="btn-primary" disabled>
        <IconWallet className="h-4 w-4" />
        Loading wallets…
      </button>
    );
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission can be refused; the address is on screen anyway.
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Connected                                                              */
  /* ---------------------------------------------------------------------- */

  if (connected) {
    const address = connected.account.address;

    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/70 px-3 py-2">
          {connected.wallet.icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URI from the wallet
            <img src={connected.wallet.icon} alt="" className="h-4 w-4 rounded" />
          ) : (
            <IconWallet className="h-4 w-4 text-haze-400" />
          )}
          <span className="mono text-xs text-haze-200">{shortenAddress(address, 5, 5)}</span>

          <button
            type="button"
            onClick={() => copyAddress(address)}
            className="text-haze-500 transition-colors hover:text-haze-200"
            aria-label="Copy wallet address"
            title={copied ? 'Copied' : 'Copy address'}
          >
            <IconCopy className="h-3.5 w-3.5" />
          </button>

          <a
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-haze-500 transition-colors hover:text-haze-200"
            aria-label="View wallet on Solana Explorer"
            title="View on Solana Explorer"
          >
            <IconExternal className="h-3.5 w-3.5" />
          </a>
        </div>

        {copied && <span className="text-[11px] text-mint-400">Address copied</span>}

        <button
          type="button"
          className="btn-ghost"
          disabled={disconnect.isRunning}
          onClick={() => disconnect.dispatch()}
        >
          {disconnect.isRunning ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* No wallet extension found                                              */
  /* ---------------------------------------------------------------------- */

  if (isReady && wallets.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <span className="text-xs text-amber-accent">No Solana wallet detected in this browser.</span>
        <a
          href="https://phantom.app/download"
          target="_blank"
          rel="noreferrer noopener"
          className="btn-primary"
        >
          <IconWallet className="h-4 w-4" />
          Install Phantom
        </a>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Disconnected                                                           */
  /* ---------------------------------------------------------------------- */

  const label = !isReady
    ? 'Loading wallets…'
    : connect.isRunning || status === 'connecting'
      ? 'Waiting for wallet…'
      : 'Connect Wallet';

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => {
            // One wallet is the common case: connect straight to it rather than
            // making the user open a menu with a single entry.
            if (wallets.length === 1) {
              connect.dispatch(wallets[0]);
            } else {
              setPickerOpen((open) => !open);
            }
          }}
        >
          <IconWallet className="h-4 w-4" />
          {label}
        </button>

        {connect.isError && (
          <span className="max-w-xs text-[11px] leading-snug text-rose-accent">
            {describeConnectError(connect.error)}
          </span>
        )}
      </div>

      {pickerOpen && wallets.length > 1 && (
        <div className="panel absolute right-0 z-20 mt-2 w-60 overflow-hidden p-1.5">
          <p className="panel-heading px-2.5 py-1.5">Choose a wallet</p>
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm
                text-haze-200 transition-colors hover:bg-ink-700/70"
              onClick={() => {
                setPickerOpen(false);
                connect.dispatch(wallet);
              }}
            >
              {wallet.icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URI from the wallet
                <img src={wallet.icon} alt="" className="h-4 w-4 rounded" />
              ) : (
                <IconWallet className="h-4 w-4 text-haze-400" />
              )}
              {wallet.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Turn a wallet connection failure into something worth reading. */
function describeConnectError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);

  if (/reject|denied|cancel/i.test(text)) {
    return 'The connection request was declined in your wallet.';
  }
  if (/locked/i.test(text)) {
    return 'Your wallet is locked. Unlock it and try again.';
  }

  return text.slice(0, 160) || 'The wallet could not be connected.';
}
