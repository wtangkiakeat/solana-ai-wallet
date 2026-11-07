'use client';

/**
 * Publishes the Solana Kit client to the React tree.
 *
 * The client is built once at module scope in lib/solana.ts, because
 * `ClientProvider` requires a stable reference across renders.
 */

import { ClientProvider, useClient } from '@solana/react';
import type { ReactNode } from 'react';

import { getAppClient, type AppClient } from '@/lib/solana';

export function Providers({ children }: { children: ReactNode }) {
  return <ClientProvider client={getAppClient()}>{children}</ClientProvider>;
}

/**
 * Read the client with the application's own capabilities attached.
 *
 * `useClient` is documented as a pure type assertion with no runtime check, so
 * naming the concrete client type here is what gives every call site typed
 * access to `rpc`, `payer`, `wallet` and the transaction plugins.
 */
export function useAppClient(): AppClient {
  return useClient<AppClient>() as unknown as AppClient;
}
