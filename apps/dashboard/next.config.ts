import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@analytics/shared'],
  // Static export for serving from Hono server
  output: 'export',
  // Trailing slash ensures clean URLs work with static file serving
  trailingSlash: true,
  // Images need to be unoptimized for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
