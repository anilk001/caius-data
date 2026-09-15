import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      // Keep one canonical host. Serving the same pages on both the apex and
      // www splits search ranking between them and makes the Stripe redirect
      // URLs ambiguous.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www\\.caiusdata\\.com' }],
        destination: 'https://caiusdata.com/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
