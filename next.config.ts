import type { NextConfig } from 'next'

/**
 * The one host every page is served from.
 *
 * GoDaddy cannot put a CNAME on a bare domain and Railway accepts nothing else,
 * so `www` is the real address for now and the apex reaches it through GoDaddy
 * forwarding. Moving DNS to Cloudflare later makes the apex workable again —
 * flatten the CNAME there, then change this one line back to 'caiusdata.com'
 * and flip the redirect below.
 */
const CANONICAL_HOST = 'www.caiusdata.com'
const OTHER_HOST = 'caiusdata.com'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      // Keep one canonical host. Serving the same pages on both splits search
      // ranking between them and makes the Stripe redirect URLs ambiguous.
      //
      // The direction matters more than it looks: while GoDaddy forwards the
      // apex to www, a rule pointing the other way would bounce every visitor
      // between the two for ever.
      {
        source: '/:path*',
        has: [{ type: 'host', value: OTHER_HOST.replace('.', '\\.') }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ]
  },
}

export default nextConfig
