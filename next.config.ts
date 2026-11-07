import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * A wallet is a high-value target for script injection: anything that can run
 * JavaScript on this origin can read the page and try to drive the wallet. The
 * Content-Security-Policy below is the main defence, and the rest close off
 * smaller avenues.
 *
 * `'unsafe-inline'` and `'unsafe-eval'` appear in `script-src` because Next.js
 * inlines its hydration bootstrap and Turbopack's dev runtime evaluates code.
 * Removing them needs per-request nonces, which is a worthwhile hardening step
 * beyond this MVP — it is listed as a known limitation in the README rather
 * than quietly ignored.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Wallet icons arrive from the extension as data: URIs.
  "img-src 'self' data: blob:",
  // Solana RPC over HTTPS and its websocket subscriptions.
  "connect-src 'self' https://*.solana.com wss://*.solana.com https://*.helius-rpc.com wss://*.helius-rpc.com https://*.quiknode.pro wss://*.quiknode.pro",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  // Do not let the page be framed — a clickjacked approve button is a real risk.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // This app needs none of these.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the workspace root to this folder. Without it, Turbopack walks up and
    // finds an unrelated lockfile in the home directory.
    root: import.meta.dirname,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
