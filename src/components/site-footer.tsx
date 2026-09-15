import Link from 'next/link'
import { Logo } from '@/components/logo'

const YEAR = new Date().getFullYear()

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
            US customs import intelligence for Indian exporters. Pay once, download
            your buyer list, keep it forever.
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Caius Data is operated by Caius Data LLC, a limited liability company
            registered in the State of Wyoming, United States.
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium tracking-wide uppercase">Product</p>
          <ul className="text-muted-foreground space-y-2">
            <li>
              <Link href="/search" className="hover:text-foreground transition-colors">
                Search importers
              </Link>
            </li>
            <li>
              <Link href="/#pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/#faq" className="hover:text-foreground transition-colors">
                How it works
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium tracking-wide uppercase">Legal</p>
          <ul className="text-muted-foreground space-y-2">
            <li>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms of service
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link href="/refunds" className="hover:text-foreground transition-colors">
                Refund policy
              </Link>
            </li>
            <li>
              <a
                href="mailto:support@caiusdata.com"
                className="hover:text-foreground transition-colors"
              >
                support@caiusdata.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {YEAR} Caius Data LLC · Wyoming, USA</p>
          <p>
            Data derived from public US Customs (CBP) vessel manifest records.
            Company-level information only.
          </p>
        </div>
      </div>
    </footer>
  )
}
