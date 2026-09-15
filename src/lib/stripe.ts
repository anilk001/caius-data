import 'server-only'

import Stripe from 'stripe'
import { requireEnv } from '@/lib/env'

let cached: Stripe | null = null

export function getStripe(): Stripe {
  if (!cached) {
    cached = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      // Pinning the version means a Stripe-side upgrade cannot change the shape
      // of webhook payloads under a running deploy.
      apiVersion: '2026-08-26.dahlia',
      appInfo: { name: 'Caius Data', url: 'https://caiusdata.com' },
    })
  }
  return cached
}
