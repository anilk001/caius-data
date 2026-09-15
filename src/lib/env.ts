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

/** Absolute origin used for Stripe redirects and email links. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  // Railway injects this for the service's generated domain.
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN
  if (railway) return `https://${railway}`
  return 'http://localhost:3000'
}

export const EXPORT_BUCKET = process.env.SUPABASE_EXPORT_BUCKET || 'order-exports'
