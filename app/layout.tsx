import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solana AI Wallet — Devnet',
  description:
    'Describe a Solana transfer in plain English. The assistant reads it, the app validates it against the chain, and you approve and sign it yourself in Phantom. Devnet only.',
};

export const viewport: Viewport = {
  themeColor: '#04071a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded by link rather than next/font so a production build never
            depends on reaching Google's servers. Falls back to the system
            sans-serif stack defined in globals.css. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
