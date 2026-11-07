import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the workspace root to this folder. Without it, Turbopack walks up and
    // finds an unrelated lockfile in the home directory.
    root: import.meta.dirname,
  },
};

export default nextConfig;
