import 'server-only'

/**
 * Which integrations are actually wired at runtime.
 *
 * The app will happily boot and render a Buy button with no Stripe key set —
 * the failure only surfaces when a customer clicks it, as a 500 they cannot
 * act on. This lets a deploy be checked at a glance instead.
 *
 * Reports presence only. No values, no partial keys, no hostnames.
 */

export interface IntegrationStatus {
  configured: boolean
  missing: string[]
}

export interface ConfigStatus {
  database: IntegrationStatus
  payments: IntegrationStatus
  email: IntegrationStatus
  site: IntegrationStatus
  /** True when everything needed to take and fulfil an order is present. */
  canTakeOrders: boolean
}

function check(vars: string[]): IntegrationStatus {
  const missing = vars.filter((name) => !process.env[name])
  return { configured: missing.length === 0, missing }
}

export function getConfigStatus(): ConfigStatus {
  const database = check([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
  const payments = check(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'])
  const email = check(['RESEND_API_KEY'])
  const site = check(['SITE_URL'])

  return {
    database,
    payments,
    email,
    site,
    // Email deliberately excluded: fulfilment stores the pack and marks the
    // order fulfilled before sending, so /success still serves the download
    // when Resend is down. A missing mail key degrades the receipt, not the sale.
    canTakeOrders: database.configured && payments.configured,
  }
}

/** Human-readable summary for logs. */
export function describeConfigStatus(status: ConfigStatus): string {
  const parts = [
    `database=${status.database.configured ? 'ok' : `MISSING(${status.database.missing.join(',')})`}`,
    `payments=${status.payments.configured ? 'ok' : `MISSING(${status.payments.missing.join(',')})`}`,
    `email=${status.email.configured ? 'ok' : `MISSING(${status.email.missing.join(',')})`}`,
  ]
  return parts.join(' ')
}
