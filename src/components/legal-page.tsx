export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Last updated {updated}</p>

      <div
        className="mt-10 space-y-6 text-sm leading-relaxed
          [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold
          [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5
          [&_p]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-4"
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The operating entity, in one place so the legal pages and the footer cannot
 * drift apart. Every user-visible mention of the company reads from here.
 *
 * TODO before taking a live payment: replace registeredAgentLine with the real
 * registered agent and Wyoming address from the formation documents, and
 * confirm legalName matches the Articles of Organization exactly — including
 * whether the state registered it as "LLC" or "L.L.C.".
 */
export const OPERATOR = {
  legalName: 'Caius Data LLC',
  jurisdiction: 'State of Wyoming, United States',
  shortJurisdiction: 'Wyoming, USA',
  registeredAgentLine: '[registered agent name and Wyoming address]',
  supportEmail: 'support@caiusdata.com',
  privacyEmail: 'privacy@caiusdata.com',
} as const
