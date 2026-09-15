import { Suspense } from 'react'
import type { Metadata } from 'next'
import { OrderStatus } from '@/components/order-status'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = {
  title: 'Order complete',
  robots: { index: false, follow: false },
}

export default function SuccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <OrderStatus />
      </Suspense>
    </div>
  )
}
