import type { Metadata } from 'next'
import { LegalPage, OPERATOR } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Refund policy',
  description: 'When Caius Data refunds a buyer pack, and how to ask.',
}

export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy" updated="15 September 2026">
      <p>
        We sell a file. Once you have it you cannot un-see it, so a blanket
        no-questions refund would not be honest for either of us. Here is exactly
        where we stand.
      </p>

      <h2>We refund in full when</h2>
      <ul>
        <li>the pack was never delivered, or the download link never worked;</li>
        <li>
          the file contains materially fewer usable records than the pack you paid
          for;
        </li>
        <li>
          the records are substantially not for the HS code or filters you selected;
        </li>
        <li>you were charged twice for the same pack.</li>
      </ul>

      <h2>We generally do not refund when</h2>
      <ul>
        <li>
          the file is correct but the companies in it were not the buyers you hoped
          for — manifest data reports who imports, not who will reply;
        </li>
        <li>
          individual records are out of date. Manifest filings lag, and we tell you
          the first- and last-seen dates so you can judge that yourself;
        </li>
        <li>you bought the wrong HS code. Ask us — we will usually swap it.</li>
      </ul>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>{' '}
        within 7 days of purchase with your order email and what went wrong.
        Approved refunds go back to your card through Stripe within 5–10 business
        days.
      </p>

      <h2>Before you buy</h2>
      <p>
        Download the free 3-row sample for your HS code first. It is the same format
        and the same source as the paid file, and it costs nothing.
      </p>
    </LegalPage>
  )
}
