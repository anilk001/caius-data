import type { Metadata } from 'next'
import { LegalPage, OPERATOR } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Caius Data handles your personal data and the business records we publish.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="15 September 2026">
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
        interest in running a secure service.
      </p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
        <li><strong>Supabase</strong> — database and file storage.</li>
        <li><strong>Railway</strong> — application hosting.</li>
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

      <h2>7. Cookies</h2>
      <p>
        We use no advertising or cross-site tracking cookies. Stripe sets cookies on
        its own checkout pages for fraud prevention.
      </p>

      <h2>8. Contact</h2>
      <p>
        <a href={`mailto:${OPERATOR.privacyEmail}`}>{OPERATOR.privacyEmail}</a>
      </p>
    </LegalPage>
  )
}
