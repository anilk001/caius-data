import Link from 'next/link'
import { OPERATOR } from '@/components/legal-page'
import { listedBuyerPages } from '@/lib/headings'
import { monthYear } from '@/lib/heading-stats'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'About Caius Data',
  description:
    'Who runs Caius Data, where the US importer records come from, how often they are updated, and what is and is not in them.',
  path: '/about',
})

/** "Data updated" reads the database; an hour is plenty. */
export const revalidate = 3600

export default async function AboutPage() {
  const listed = await listedBuyerPages().catch(() => [])
  const latest = listed
    .map((l) => l.updatedAt)
    .reduce<string | null>((hi, v) => (v && (!hi || v > hi) ? v : hi), null)
  const updated = monthYear(latest)

  return (
    <div
      className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20
        [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold
        [&_li]:text-muted-foreground [&_p]:text-muted-foreground [&_p]:leading-relaxed
        [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_a]:underline [&_a]:underline-offset-4"
    >
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">About Caius Data</h1>
      <p className="mt-4 text-lg">
        Caius Data sells one-time lists of US companies that already import a
        product, read from US Customs records and priced per company. It is built
        for small and medium exporters who need one list, not a trade-data
        subscription.
      </p>

      <h2>Who runs it</h2>
      <p>
        Caius Data is operated by {OPERATOR.legalName}, a limited liability company
        registered in the {OPERATOR.jurisdiction}, and run by its owner, Anil Kumar.
      </p>

      <h2>Where the data comes from</h2>
      <p>
        US Customs and Border Protection (CBP) releases import manifest data —
        mostly ocean vessel manifests — for public inspection under 19 CFR 103.31.
        We buy those records from a licensed trade-data provider, then clean and
        merge them ourselves, so each row of a list is one US importing company.
        Our records today come from shipments on the India–US trade lane; the
        companies in them buy from overseas suppliers, which is why they are
        relevant to exporters anywhere.
      </p>

      <h2>How often it is updated</h2>
      <p>
        There is no fixed schedule. We load records one trade lane at a time and
        add to a lane when new filings are bought. Every buyer page shows the month
        its data was last updated, and every company in a file carries its first
        and last shipment dates.
        {updated && <> The most recent update was in {updated}.</>}
      </p>

      <h2>What is in the data</h2>
      <ul>
        <li>The importing company’s name and street address, with city and state where the record carries them.</li>
        <li>Port of entry, a description of the goods, and how many shipments we observed.</li>
        <li>The first and last shipment dates we hold for the company.</li>
        <li>
          An HS4 code, marked as declared by the filer or derived from the goods
          description. CBP’s public data carries no tariff code, so most codes are
          derived, and the file says which.
        </li>
      </ul>

      <h2>What is not in the data</h2>
      <ul>
        <li>No email addresses, phone numbers or named people. We do not collect personal contact data.</li>
        <li>No freight forwarders or parcel consolidators: we filter them out so a list holds buyers.</li>
        <li>No companies outside the US: Canadian and Mexican consignees are excluded from US lists.</li>
        <li>
          Not every importer. Companies can ask CBP to keep their name off released
          manifests, and those shipments reach us with the consignee blanked.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Orders and questions:{' '}
        <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>. Privacy
        requests: <a href={`mailto:${OPERATOR.privacyEmail}`}>{OPERATOR.privacyEmail}</a>.
        See also the <Link href="/terms">terms</Link>,{' '}
        <Link href="/privacy">privacy policy</Link> and{' '}
        <Link href="/refunds">refund policy</Link>.
      </p>
    </div>
  )
}
