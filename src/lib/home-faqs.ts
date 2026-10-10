import type { Faq } from '@/lib/buyer-pages'

/**
 * The home page FAQ, at /#faq — the anchor the footer has linked to since
 * launch, which until now landed on "How it works".
 *
 * One list feeds both the visible section and the FAQPage JSON-LD, which must
 * match word for word. Every answer is checked against what the product does
 * today, not what a trade-data site usually says:
 *
 * - "What's in the CSV" is PACK_COLUMNS in src/lib/export-columns.ts.
 * - The contact answer is a no: the vendor's contact endpoints are never
 *   called (CLAUDE.md, rule 5).
 * - Freshness has no fixed schedule. Lanes are bought and loaded one at a
 *   time, so the honest answer says that and points at the dates we do show.
 * - The refund answer is the /refunds policy in one paragraph, not a promise
 *   the policy does not make.
 */
export function homeFaqs(minRecords: number): Faq[] {
  return [
    {
      question: 'Where does the data come from?',
      answer:
        'From US Customs and Border Protection (CBP) import manifests — mostly ocean vessel manifests — ' +
        'which CBP releases for public inspection. We clean and merge them at company level: each row is ' +
        'one US importing company, never a person, and freight forwarders are filtered out.',
    },
    {
      question: "I'm not from India. Is this useful for me?",
      answer:
        'Yes. Our records today come from shipments on the India–US trade lane, so every company in them ' +
        'already buys this product from overseas suppliers. That makes them relevant to any exporter of ' +
        'the same product, from Bangladesh, Pakistan, Vietnam, Turkey, Africa or anywhere else. We do not ' +
        'claim they buy from your country — only that they already import what you make.',
    },
    {
      question: "What's in the CSV?",
      answer:
        'For each company: full company name, street address, city, state, port of entry, HS code, ' +
        'product description, number of shipments observed, and the first and last shipment dates. ' +
        'Where one company files from several locations, the others are listed in the same row. City and ' +
        'state are blank where the source record carries no address.',
    },
    {
      question: 'Is there a subscription?',
      answer:
        'No. You pay once by card for the companies you take and the file is yours to keep. Nothing ' +
        'renews and there is no account to cancel.',
    },
    {
      question: 'What if there are fewer companies than I asked for?',
      answer:
        'You pay only for the companies we hold. Checkout recounts the distinct companies matching your ' +
        'filters before it charges, and never charges for more than it can deliver. The smallest list we ' +
        `sell is ${minRecords} companies.`,
    },
    {
      question: 'Can I get a refund?',
      answer:
        'Email support@caiusdata.com within 7 days of purchase. We refund in full if the file was never ' +
        'delivered, holds materially fewer usable records than you paid for, is not for the HS code you ' +
        'chose, or you were charged twice. If you picked the wrong HS code we will usually swap it.',
    },
    {
      question: 'How fresh is the data?',
      answer:
        'We load records one trade lane at a time rather than on a fixed schedule, and add to a lane when ' +
        'new filings are bought. Each buyer page shows the month its data was last updated, and every ' +
        'company in the CSV carries its first and last shipment dates, so you can judge recency yourself.',
    },
    {
      question: 'Do you include contact emails or phone numbers?',
      answer:
        'No. The file contains no email addresses, phone numbers or named people — we do not collect ' +
        'personal contact data. It gives you the company name and street address, which most exporters ' +
        'use to find the buying team on the company website or LinkedIn.',
    },
  ]
}
