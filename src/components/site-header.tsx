import Link from 'next/link'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/search">Search buyers</Link>
          </Button>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
            <Link href="/#pricing">Pricing</Link>
          </Button>
          <Button variant="brand" size="sm" asChild>
            <Link href="/search">Get buyer list</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
