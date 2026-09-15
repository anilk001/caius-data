import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <p className="text-brand text-sm font-medium">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground mt-3 leading-relaxed">
        That link does not lead anywhere. The buyer search is still where you left it.
      </p>
      <Button variant="brand" className="mt-7" asChild>
        <Link href="/search">Search US importers</Link>
      </Button>
    </div>
  )
}
