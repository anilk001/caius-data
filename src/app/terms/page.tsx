import type { Metadata } from 'next'
import { LegalPage, OPERATOR } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms on which Caius Data sells one-time US importer data packs.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="15 September 2026">
      <p>
        These terms govern your use of caiusdata.com and any data pack you purchase
        from it. The service is operated by {OPERATOR.legalName}, a limited liability
        company registered in the {OPERATOR.jurisdiction}
        {' '}({OPERATOR.registeredAgentLine}). By buying a pack you agree to these terms.
      </p>

      <h2>1. What we sell</h2>
      <p>
        We sell one-time downloadable files containing company-level information
        about businesses that have imported goods into the United States. Each
        purchase is a single transaction for a single file. There is no
        subscription, no recurring charge and nothing to cancel.
      </p>

      <h2>2. Where the data comes from</h2>
      <p>
        Our records are derived from vessel manifest data that US Customs and Border
        Protection makes available as a public record, together with commercially
        licensed trade datasets built on the same source. We publish company-level
        information only.
      </p>
      <p>
        We do not warrant that any record is current, complete or accurate. Manifest
        data is filed by carriers and brokers, and it carries their errors. Verify a
        company before you act on it commercially.
      </p>

      <h2>3. Your licence to use the data</h2>
      <p>You may:</p>
      <ul>
        <li>use purchased records for your own business development and outreach;</li>
        <li>store them in your own CRM or spreadsheets;</li>
        <li>share them internally within your company.</li>
      </ul>
      <p>You may not:</p>
      <ul>
        <li>resell, republish or redistribute the records as a dataset or product;</li>
        <li>use them for unlawful, deceptive or abusive communications;</li>
        <li>
          scrape, bulk-download or otherwise extract our search results by automated
          means.
        </li>
      </ul>

      <h2>4. Your obligations when contacting buyers</h2>
      <p>
        You are responsible for complying with the laws that apply to your outreach,
        including anti-spam, telemarketing and data protection rules in your country
        and in the recipient&apos;s. We do not send communications on your behalf and
        take no responsibility for how you use a purchased list.
      </p>

      <h2>5. Payment</h2>
      <p>
        Payments are processed by Stripe. We never see or store your card details.
        Prices are in US dollars and exclude any tax that may apply in your
        jurisdiction.
      </p>

      <h2>6. Delivery and refunds</h2>
      <p>
        Packs are delivered by email as a download link valid for seven days. Our
        refund position is set out in the <a href="/refunds">refund policy</a>, which
        forms part of these terms.
      </p>

      <h2>7. Liability</h2>
      <p>
        To the fullest extent permitted by law, our total liability arising out of or
        in connection with a purchase is limited to the amount you paid for that
        purchase. We are not liable for lost profits, lost business or indirect
        losses of any kind.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these terms. The version in force when you buy is the one that
        governs that purchase.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the laws of the {OPERATOR.jurisdiction}, without
        regard to conflict-of-law rules.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms:{' '}
        <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>.
      </p>
    </LegalPage>
  )
}
