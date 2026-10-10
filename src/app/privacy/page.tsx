import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo'
import { CONTENT_UPDATED, longDate } from '@/lib/content-dates'
import { LegalPage, OPERATOR } from '@/components/legal-page'

export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy',
  description: 'How Caius Data handles your personal data and the business records we publish.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated={longDate(CONTENT_UPDATED.privacy)}>
      <p>
        {OPERATOR.legalName} ({OPERATOR.jurisdiction}) operates caiusdata.com. This
        policy explains what we collect from you as a customer, and separately, what
        business records we publish about importing companies.
      </p>

      <h2>1. What we collect about you</h2>
      <ul>
        <li>
          <strong>Email address</strong> — collected by Stripe at checkout and used
          to deliver your file and any support correspondence.
        </li>
        <li>
          <strong>Order details</strong> — the pack you bought, the filters you
          bought it for, the amount charged and the delivery status.
        </li>
        <li>
          <strong>Payment data</strong> — handled entirely by Stripe. We receive a
          transaction reference, never your card number.
        </li>
        <li>
          <strong>Basic server logs</strong> — IP address and request metadata, kept
          for security and abuse prevention.
        </li>
      </ul>
      <p>
        Searching requires no account and no personal data. You can browse the entire
        dataset and download a sample without telling us who you are.
      </p>

      <h2>2. Why we can process it</h2>
      <p>
        We process your email and order details to perform the contract you entered
        when you bought a pack. We keep server logs on the basis of our legitimate
        interest in running a secure service. Advertising pixels run only on your
        consent, which you can withdraw at any time.
      </p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
        <li><strong>Supabase</strong> — database and file storage.</li>
        <li><strong>Railway</strong> — application hosting.</li>
        <li>
          <strong>Meta</strong> and <strong>TikTok</strong> — advertising
          measurement, and only if you accept advertising cookies (section 7).
        </li>
      </ul>
      <p>
        We do not sell your personal data, and we do not add you to a marketing list
        because you bought something.
      </p>

      <h2>4. How long we keep it</h2>
      <p>
        Order records are retained for seven years to meet accounting obligations.
        Generated CSV files are deleted from storage after their download link
        expires. Server logs are retained for 90 days.
      </p>

      <h2>5. The business records we publish</h2>
      <p>
        Our dataset describes companies, not individuals: importer name, business
        address, port of entry, HS code and shipment counts, derived from public US
        Customs manifest filings. Where a business record incidentally identifies a
        person — for example a sole trader operating under their own name — you may
        ask us to remove it, and we will.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on where you live you may have the right to access, correct, delete
        or export your personal data, and to object to its processing. Write to{' '}
        <a href={`mailto:${OPERATOR.privacyEmail}`}>{OPERATOR.privacyEmail}</a> and we
        will respond within 30 days.
      </p>

      <h2 id="cookies">7. Cookies and advertising pixels</h2>
      <p>
        We use the Meta Pixel and the TikTok Pixel to measure our advertising on
        those platforms — whether someone who saw an ad went on to view a buyer
        page, run a search, download a free sample, start checkout or buy. They
        set cookies and send Meta and TikTok your browser and device details, the
        pages you visit here, and those events (with the HS codes involved and an
        order value, never your card details or the file you bought), together
        with any campaign tags in the link you arrived from.
      </p>
      <p>
        These pixels load only after you click Accept on our cookie banner. If you
        decline, or never choose, they are not loaded and nothing is sent. You can
        change your mind at any time with the Cookie settings link at the foot of
        every page. Meta and TikTok process this data under their own privacy
        policies, and may transfer it outside the EU.
      </p>
      <p>
        We set no other advertising or cross-site tracking cookies. We keep your
        cookie choice, and the campaign you arrived from, in your browser&apos;s own
        storage. Stripe sets cookies on its own checkout pages for fraud
        prevention.
      </p>

      <h2>8. Contact</h2>
      <p>
        <a href={`mailto:${OPERATOR.privacyEmail}`}>{OPERATOR.privacyEmail}</a>
      </p>
    </LegalPage>
  )
}
