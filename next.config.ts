import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/tk-logo.svg', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
