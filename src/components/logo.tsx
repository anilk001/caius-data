import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Wordmark: lowercase "caius data" with a red accent dot standing in for the
 * tittle on the "i". Rendered as live text (not an image) so it stays crisp,
 * selectable and readable to screen readers.
 */
export function Logo({
  className,
  size = 'default',
}: {
  className?: string
  size?: 'default' | 'lg'
}) {
  return (
    <Link
      href="/"
      aria-label="Caius Data home"
      className={cn(
        'inline-flex items-baseline font-semibold tracking-tight lowercase',
        size === 'lg' ? 'text-2xl' : 'text-lg',
        className,
      )}
    >
      <span aria-hidden="true">ca</span>
      <span className="relative" aria-hidden="true">
        ı
        <span
          className={cn(
            'bg-brand absolute left-1/2 -translate-x-1/2 rounded-full',
            size === 'lg' ? 'top-[0.15em] size-[0.19em]' : 'top-[0.16em] size-[0.2em]',
          )}
        />
      </span>
      <span aria-hidden="true">us</span>
      <span className="text-muted-foreground ml-1.5 font-normal" aria-hidden="true">
        data
      </span>
      <span className="sr-only">Caius Data</span>
    </Link>
  )
}
