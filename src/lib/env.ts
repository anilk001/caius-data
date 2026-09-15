/**
 * Environment access helpers.
 *
 * Server secrets are read lazily through `requireEnv` so that a missing
 * variable surfaces as a clear runtime error on the one route that needs it,
 * rather than crashing the whole build. `next build` runs without secrets.
 */

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    )
  }
  return value
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback
}

/**
 * Absolute origin used for Stripe redirect URLs, email links, robots and
 * sitemap. Server-side only.
 *
 * Order matters. `NEXT_PUBLIC_*` variables are inlined into the bundle at BUILD
 * time, so one that is only present at runtime reads as undefined — which would
 * silently send Stripe redirects to localhost. `SITE_URL` is a plain server
 * variable read at request time, so it is checked first and is the one to set
 * if you are unsure.
 */
export function siteUrl(): string {
  const candidates = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    // Railway injects this for the service's generated domain.
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined,
  ]

  for (const candidate of candidates) {
    if (candidate) {
      const trimmed = candidate.trim().replace(/\/$/, '')
      if (trimmed) {
        return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
      }
    }
  }

  return 'http://localhost:3000'
}

export const EXPORT_BUCKET = process.env.SUPABASE_EXPORT_BUCKET || 'order-exports'
