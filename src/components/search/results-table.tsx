'use client'

import { Lock } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber } from '@/lib/utils'
import type { PublicCompany } from '@/types/database'

/**
 * Redaction glyphs for the locked columns.
 *
 * Deliberately NOT real data, and deliberately not plausible fake data either.
 * CSS blur is a visual affordance, not a security boundary — anything sent to
 * the browser can be read out of the DOM. The genuinely withheld fields (street
 * address, port of entry, first/last seen) are filtered out server-side by
 * PUBLIC_COMPANY_COLUMNS and never leave the database.
 *
 * Varying the width per row keeps the column from looking like a repeating
 * pattern, which is what makes a redacted table read as real.
 */
function redaction(seed: string, min: number, max: number): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return '•'.repeat(min + (hash % (max - min + 1)))
}

export function ResultsTable({
  rows,
  loading,
}: {
  rows: PublicCompany[]
  loading: boolean
}) {
  if (loading && rows.length === 0) {
    return <TableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="min-w-[220px]">Importer company</TableHead>
          <TableHead className="min-w-[130px]">Location</TableHead>
          <TableHead className="min-w-[90px]">HS code</TableHead>
          <TableHead className="min-w-[200px]">Product</TableHead>
          <TableHead className="min-w-[90px] text-right">Shipments</TableHead>
          <TableHead className="min-w-[150px]">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden="true" />
              Street address
            </span>
          </TableHead>
          <TableHead className="min-w-[140px]">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden="true" />
              Port of entry
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>

            <TableCell className="text-muted-foreground whitespace-nowrap">
              {[row.city, row.state].filter(Boolean).join(', ') || '—'}
            </TableCell>

            <TableCell>
              <Badge variant="secondary" className="tnum font-mono">
                {row.hs4_code}
              </Badge>
            </TableCell>

            <TableCell className="text-muted-foreground max-w-[320px] truncate">
              {row.product_description || '—'}
            </TableCell>

            <TableCell className="tnum text-right font-medium">
              {formatNumber(row.shipment_count)}
            </TableCell>

            <TableCell aria-label="Locked — included in the paid pack">
              <span className="locked-cell" aria-hidden="true">
                {redaction(`${row.id}-addr`, 12, 20)}
              </span>
            </TableCell>

            <TableCell aria-label="Locked — included in the paid pack">
              <span className="locked-cell" aria-hidden="true">
                {redaction(`${row.id}-port`, 8, 14)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
