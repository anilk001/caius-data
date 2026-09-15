import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      // caiustrade.com is a defensive registration that points at the same
      // Railway service; anything arriving on it is sent to the canonical host.
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?caiustrade\\.com' }],
        destination: 'https://caiusdata.com/:path*',
        permanent: true,
      },
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
