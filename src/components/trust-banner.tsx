import { CreditCard, FileSpreadsheet, Lock, Repeat } from 'lucide-react'

const POINTS = [
  {
    icon: Repeat,
    title: 'No subscription',
    body: 'One payment, one file. Nothing renews, nothing to cancel.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Plain CSV',
    body: 'Opens in Excel, Google Sheets or Tally. No portal, no login.',
  },
  {
    icon: Lock,
    title: 'Public manifest data',
    body: 'Sourced from US Customs records. Company-level, legally sold.',
  },
  {
    icon: CreditCard,
    title: 'Stripe checkout',
    body: 'Card details never touch our servers. Refund within 7 days.',
  },
]

export function TrustBanner() {
  return (
    <section className="border-y bg-card/50">
      <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-6 px-4 py-10 sm:px-6 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3">
            <Icon className="text-brand mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
