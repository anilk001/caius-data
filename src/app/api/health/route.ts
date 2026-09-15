import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Railway healthcheck target. Intentionally does not touch the database. */
export function GET() {
  return NextResponse.json({ ok: true, service: 'caius-data' })
}
