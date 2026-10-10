/**
 * Buyer's guides at /guides/[slug].
 *
 * Plain data rather than MDX: the site has no content pipeline, five guides
 * do not need one, and a typed list lets the sitemap and the index read the
 * same `draft` flag the page does.
 *
 * Drafts are outlines only. They render with `noindex, follow` and stay out of
 * the sitemap until `draft` is false — an outline indexed under a guide's
 * title is a thin page Google remembers. To publish one: write `body` for
 * each section, set `updated`, set `draft: false`.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

export interface GuideSection {
  heading: string
  /** What the section must cover — the brief for whoever writes it. */
  outline: string[]
  /** The written section, once there is one. Paragraphs. */
  body?: string[]
}

export interface Guide {
  slug: string
  title: string
  description: string
  /** HS4 headings whose /buyers pages this guide links to. */
  hs4: string[]
  draft: boolean
  /** ISO date of the last content change — the sitemap's lastmod. */
  updated: string
  sections: GuideSection[]
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-find-buyers-in-the-usa',
    title: 'How to find buyers in the USA for your product',
    description:
      'A step-by-step way for small exporters to find US companies that already import their product, using US Customs records.',
    hs4: ['6204', '0904'],
    draft: true,
    updated: '2026-10-10',
    sections: [
      {
        heading: 'Start from who already imports, not who might',
        outline: [
          'Why a company already importing your product is a warmer lead than a directory listing.',
          'What US Customs import manifests record, and what they do not (no HS code, no contacts).',
        ],
      },
      {
        heading: 'Find your HS code',
        outline: ['Link to the HS code guide.', 'Why four digits (the heading) is the right level to search.'],
      },
      {
        heading: 'Build and filter the list',
        outline: [
          'Searching by HS code and keyword; filtering by state and port of entry.',
          'Reading shipment counts: a frequent importer versus a one-off.',
          'Why freight forwarders are removed from a buyer list.',
        ],
      },
      {
        heading: 'From a company name to a conversation',
        outline: [
          'Finding the buying or sourcing team from the company name and address.',
          'Link to the guide on emailing a US importer.',
        ],
      },
    ],
  },
  {
    slug: 'what-is-an-hs-code',
    title: 'What is an HS code and how to find yours',
    description:
      'What the Harmonized System is, how the 2-, 4- and 6-digit levels work, and how to find the right code for your product.',
    hs4: ['6204', '0904'],
    draft: true,
    updated: '2026-10-10',
    sections: [
      {
        heading: 'The Harmonized System in one paragraph',
        outline: ['Chapters, headings and subheadings: 2, 4 and 6 digits.', 'Where the US HTS adds 10-digit lines.'],
      },
      {
        heading: 'Finding your code',
        outline: [
          'Using your own shipping bill or invoice first.',
          "Looking it up in the official tariff schedule (USITC's HTS search).",
          'Worked examples: a cotton dress (6204), ground red chilli (0904).',
        ],
      },
      {
        heading: 'Why US manifest data carries no HS code',
        outline: [
          'The 22 data elements CBP releases under 19 CFR 103.31(e)(3), and why a code is not one of them.',
          'How Caius Data derives the heading from the goods description, and labels it as derived.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-email-a-us-importer',
    title: 'How to email a US importer (with template)',
    description:
      'What to put in a first email to a US importer, what to leave out, and a short template you can adapt.',
    hs4: ['6204', '0904'],
    draft: true,
    updated: '2026-10-10',
    sections: [
      {
        heading: 'Before you write',
        outline: [
          'Find the right person: sourcing, buying or product development, not a general inbox.',
          'Check what the company already imports, so the email is about their product line.',
        ],
      },
      {
        heading: 'The template',
        outline: [
          'Subject: [Product] supplier — [certification or capacity], [your country]',
          'Line 1: who you are and what you make, in one sentence.',
          'Line 2: why them — the product line you know they import.',
          'Line 3: one proof point (certification, capacity, a named customer if permitted).',
          'Line 4: a small, specific ask — samples, a price list or a 15-minute call.',
          'Signature: name, company, website, phone.',
        ],
      },
      {
        heading: 'Follow-up and mistakes to avoid',
        outline: [
          'One follow-up after a week; then stop.',
          'Avoid attachments in a first email, long company histories and bulk sends.',
          'Business-to-business email rules differ by country; check yours before a large campaign.',
        ],
      },
    ],
  },
  {
    slug: 'exporting-garments-to-the-us',
    title: "Exporting garments to the US: beginner's checklist",
    description:
      'A checklist for small garment exporters shipping to the US: classification, labelling, compliance and finding buyers.',
    hs4: ['6204'],
    draft: true,
    updated: '2026-10-10',
    sections: [
      {
        heading: 'Classify the garment',
        outline: ['Knitted (chapter 61) versus woven (chapter 62).', "Women's versus men's headings, e.g. 6204 versus 6203."],
      },
      {
        heading: 'Labelling and compliance',
        outline: [
          'Fibre content, country of origin and care labelling — to be checked against current FTC rules.',
          'Flammability and children’s product rules where they apply.',
          'Forced-labour import rules and the supply-chain documents buyers now ask for.',
        ],
      },
      {
        heading: 'Finding the buyers',
        outline: ['Link to the US importers of women’s garments (HS 6204) page.', 'What a buyer expects in a first sample.'],
      },
    ],
  },
  {
    slug: 'exporting-spices-to-the-us',
    title: 'Exporting spices to the US: FDA registration and rules',
    description:
      'What a small spice exporter needs before shipping to the US: FDA facility registration, prior notice, and the checks that cause detentions.',
    hs4: ['0904', '0910', '0909'],
    draft: true,
    updated: '2026-10-10',
    sections: [
      {
        heading: 'Before the first shipment',
        outline: [
          'FDA food facility registration for the manufacturing or packing facility.',
          'Prior notice of imported food shipments.',
          'The US importer’s Foreign Supplier Verification Programme (FSVP) duties, and what they will ask you for.',
          'Every point to be checked against current FDA guidance before publishing.',
        ],
      },
      {
        heading: 'Why spice shipments get detained',
        outline: ['Microbial contamination (e.g. Salmonella).', 'Pesticide and treatment residues.', 'Labelling and documentation gaps.'],
      },
      {
        heading: 'Finding the buyers',
        outline: ['Link to the US importers of pepper and chillies (HS 0904) page.', 'Other spice headings: 0910, 0909.'],
      },
    ],
  },
]

export function findGuide(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null
}

export function guidePath(guide: Guide): string {
  return `/guides/${guide.slug}`
}

export function publishedGuides(): Guide[] {
  return GUIDES.filter((g) => !g.draft)
}
