/**
 * Server-rendered landing pages, one per HS4 heading: /buyers/[slug].
 *
 * /search renders its rows in the browser, so Google fetched /search?hs4=6204
 * and indexed an H1 and a footer. These pages put the count, the stats and a
 * sample of buyers into the HTML itself.
 *
 * Definitions only — no counts. A page is published only while the database
 * holds at least MIN_RECORDS separate US buyers under its heading, which
 * `src/app/buyers/[slug]/page.tsx` checks at render time. A definition here is
 * a candidate, not a promise: of the thirteen below, two had stock on
 * 10 October 2026 (6204 and 0904), and the rest wait for their lane to load.
 *
 * Product names were checked against the HS nomenclature, not just the slug.
 * 0904 was briefed as "black pepper", but the heading is pepper of the genus
 * Piper *and* capsicum — and every record loaded under it is dried or ground
 * red chilli (HS6 090421, 090422). A page selling chilli importers as pepper
 * buyers is a refund waiting to happen, so the page names both.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

export interface BuyerPage {
  /** URL segment. Always ends `-hs-{hs4}`. */
  slug: string
  hs4: string
  /** Title-case product name for the H1: "US Importers of {product} (HS …)". */
  product: string
  /** Lower-case form for running prose: "who imports {productLower}". */
  productLower: string
  /** The PromoPack slug this heading belongs to. */
  sector: string
  /** What the heading covers, in the nomenclature's terms. */
  covers: string
}

export const BUYER_PAGES: BuyerPage[] = [
  {
    slug: 'us-importers-womens-garments-hs-6204',
    hs4: '6204',
    product: "Women's Garments",
    productLower: "women's garments",
    sector: 'garments',
    covers: "women's and girls' suits, jackets, dresses, skirts and trousers, not knitted",
  },
  {
    slug: 'us-importers-mens-garments-hs-6203',
    hs4: '6203',
    product: "Men's Garments",
    productLower: "men's garments",
    sector: 'garments',
    covers: "men's and boys' suits, jackets, trousers and shorts, not knitted",
  },
  {
    slug: 'us-importers-t-shirts-hs-6109',
    hs4: '6109',
    product: 'T-Shirts',
    productLower: 't-shirts',
    sector: 'garments',
    covers: 'T-shirts, singlets and vests, knitted or crocheted',
  },
  {
    slug: 'us-importers-sweaters-knitwear-hs-6110',
    hs4: '6110',
    product: 'Sweaters & Knitwear',
    productLower: 'sweaters and knitwear',
    sector: 'garments',
    covers: 'jerseys, pullovers, cardigans and waistcoats, knitted or crocheted',
  },
  {
    slug: 'us-importers-mens-shirts-hs-6205',
    hs4: '6205',
    product: "Men's Shirts",
    productLower: "men's shirts",
    sector: 'garments',
    covers: "men's and boys' shirts, not knitted",
  },
  {
    slug: 'us-importers-womens-blouses-hs-6206',
    hs4: '6206',
    product: "Women's Blouses",
    productLower: "women's blouses",
    sector: 'garments',
    covers: "women's and girls' blouses and shirts, not knitted",
  },
  {
    slug: 'us-importers-bed-table-linen-hs-6302',
    hs4: '6302',
    product: 'Bed & Table Linen',
    productLower: 'bed and table linen',
    sector: 'garments',
    covers: 'bed linen, table linen, toilet linen and kitchen linen',
  },
  {
    slug: 'us-importers-pepper-chillies-hs-0904',
    hs4: '0904',
    product: 'Pepper & Chillies',
    productLower: 'pepper and chillies',
    sector: 'spices',
    covers: 'pepper of the genus Piper and dried, crushed or ground capsicum (red chilli)',
  },
  {
    slug: 'us-importers-turmeric-ginger-spices-hs-0910',
    hs4: '0910',
    product: 'Turmeric, Ginger & Spices',
    productLower: 'turmeric, ginger and spices',
    sector: 'spices',
    covers: 'ginger, saffron, turmeric, thyme, bay leaves, curry and other spices',
  },
  {
    slug: 'us-importers-cumin-coriander-seeds-hs-0909',
    hs4: '0909',
    product: 'Cumin & Coriander Seeds',
    productLower: 'cumin and coriander seeds',
    sector: 'spices',
    covers: 'seeds of anise, star anise, fennel, coriander, cumin and caraway',
  },
  {
    slug: 'us-importers-cinnamon-hs-0906',
    hs4: '0906',
    product: 'Cinnamon',
    productLower: 'cinnamon',
    sector: 'spices',
    covers: 'cinnamon and cinnamon-tree flowers',
  },
  {
    slug: 'us-importers-nutmeg-cardamom-hs-0908',
    hs4: '0908',
    product: 'Nutmeg & Cardamom',
    productLower: 'nutmeg and cardamom',
    sector: 'spices',
    covers: 'nutmeg, mace and cardamoms',
  },
  {
    slug: 'us-importers-cashew-nuts-hs-0801',
    hs4: '0801',
    product: 'Cashew Nuts & Coconuts',
    productLower: 'cashew nuts and coconuts',
    sector: 'spices',
    covers: 'coconuts, Brazil nuts and cashew nuts, fresh or dried',
  },
]

export function findBuyerPage(slug: string): BuyerPage | null {
  return BUYER_PAGES.find((page) => page.slug === slug) ?? null
}

export function buyerPageForHs4(hs4: string): BuyerPage | null {
  return BUYER_PAGES.find((page) => page.hs4 === hs4) ?? null
}

export function buyerPageHref(page: BuyerPage): string {
  return `/buyers/${page.slug}`
}

/** Pages in the same sector, for the "related headings" links. */
export function relatedBuyerPages(page: BuyerPage): BuyerPage[] {
  return BUYER_PAGES.filter((p) => p.sector === page.sector && p.slug !== page.slug)
}

/** The H1, which is also the title. One function, so the two cannot drift. */
export function buyerPageHeading(page: BuyerPage, buyers: number): string {
  return `US Importers of ${page.product} (HS ${page.hs4}) — ${buyers.toLocaleString('en-US')} Buyer Companies`
}

/**
 * Legal suffixes left readable in a masked name. Mirrors LEGAL_SUFFIXES in
 * src/lib/buyers.ts, which this module cannot import without losing its
 * plain-Node testability.
 */
const KEEP_SUFFIXES = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'llc', 'lp', 'llp', 'plc', 'pllc',
])

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * "OLD NAVY LLC" → "O** N*** LLC".
 *
 * The name is the paid product, and these rows sit in server HTML that Google
 * indexes and anyone can scrape. Every word but a legal suffix is reduced to
 * its first letter, so a page shows that a buyer exists and how big it is
 * without saying who. Masking only the first word ("A***** Apparel Inc")
 * would leave "Navy" and "Gap" on the page, and those identify the buyer
 * outright.
 */
export function maskCompanyName(name: string | null | undefined): string {
  const words = (name ?? '').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'

  return words
    .map((word) => {
      const bare = word.toLowerCase()
      if (KEEP_SUFFIXES.has(bare)) return /^(llc|lp|llp|plc|pllc)$/.test(bare) ? bare.toUpperCase() : titleCase(word)
      const first = word.match(/[a-z0-9]/i)?.[0]?.toUpperCase() ?? '*'
      return first + '*'.repeat(Math.max(word.length - 1, 2))
    })
    .join(' ')
}

/**
 * Words cut from a goods description before it is shown as a product line.
 * Filers pack the field with logistics — bag counts, weights, container sizes,
 * fumigation — none of which says what the buyer buys.
 */
const NOISE_WORDS = new Set([
  'hs', 'hts', 'code', 'codes', 'no', 'nos', 'total', 'of', 'bags', 'bag', 'gr', 'nt', 'net',
  'gross', 'wt', 'kgs', 'kg', 'lbs', 'lb', 'pp', 'new', 'container', 'containers',
  'fcl', 'hc', 'hq', 'reefer', 'reffer', 'said', 'to', 'contain', 'stc', 'packed', 'in',
  'paper', 'jumbo', 'with', 'inner', 'liner', 'eto', 'treated', 'steam', 'irradiated',
  'pallets', 'pallet', 'cartons', 'carton', 'ctns', 'pcs', 'pieces', 'packages', 'only',
  'each', 'x', 'the', 'and', 'bulk', 'laminated', 'weight', 'pkgs',
])

/**
 * Where the useful part of a description ends. After these, filers write
 * invoice numbers, shipping-bill numbers, GSTINs and FDA registrations —
 * identifiers of the exporter, not of the product.
 */
const CUT_MARKERS = /\b(invoice|inv|s\/?\s?bill|sb\s+no|gstin|fda|iec|ref|freight|po\s?no|order\s?no|temp|humidity)\b/i

/**
 * A short, readable product line from a filer's goods description.
 *
 * "TOTAL NO. OF BAGS- 1469 BAGS RED CHILLI WHOLE S-17 STEMLESS ETO TREATED …
 * INVOICE NO. EGST/0692 …" becomes "Red Chilli Whole Stemless". The full text
 * stays in the paid file; a public page needs to say what the buyer imports,
 * not repeat a shipping bill — and the tail of that field is where exporters'
 * tax and registration numbers sit.
 */
export function productLine(description: string | null | undefined, maxWords = 6): string {
  if (!description) return '—'
  const head = description.split(CUT_MARKERS)[0] ?? ''
  const words = head
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    // Two-letter tokens are almost always a word the filer's line wrap split
    // in half ("BA GS" for "BAGS"), not a word of their own.
    .filter((w) => w.length > 2 && !/\d/.test(w) && !NOISE_WORDS.has(w.toLowerCase()))
    .slice(0, maxWords)

  return words.length ? words.map(titleCase).join(' ') : '—'
}

export interface Faq {
  question: string
  answer: string
}

/**
 * The three questions on each page. Built here, not in the page, because the
 * FAQPage JSON-LD must match the visible text word for word — Google drops
 * rich results whose markup and page disagree.
 *
 * Every claim is checked against what the paid file actually holds: full name,
 * street address, city, state, port of entry, product description, shipment
 * count and date range. No emails, phones or named people — the vendor's
 * contact endpoints are never called (CLAUDE.md, rule 5).
 */
export function buyerPageFaqs(
  page: BuyerPage,
  buyers: number,
  topStates: string[],
): Faq[] {
  const count = buyers.toLocaleString('en-US')
  const where = topStates.length
    ? ` The largest groups are in ${joinList(topStates.slice(0, 3))}.`
    : ''
  return [
    {
      question: `Who imports ${page.productLower} into the US?`,
      answer:
        `US Customs import manifests name the consignee of every shipment into the United States. ` +
        `Caius Data holds ${count} separate US companies recorded as buyers of goods under HS ${page.hs4}: ` +
        `${page.covers}.${where} Each one has already imported this product from an overseas supplier.`,
    },
    {
      question: 'How do I contact these importers?',
      answer:
        'The paid CSV gives each company’s full name, street address, city, state and port of entry. ' +
        'It does not include email addresses, phone numbers or named people, because we do not collect ' +
        'personal contact data. Most exporters use the company name and address to find the buying or ' +
        'sourcing team on the company’s own website or LinkedIn, then send a short introduction with ' +
        'their product, certifications and price range.',
    },
    {
      question: 'Is this data legal to use?',
      answer:
        'The records come from US import manifests, which US Customs and Border Protection releases ' +
        'for public inspection under 19 CFR 103.31. They describe companies, not individuals. You may ' +
        'use the list to contact these companies about your own products; our terms do not allow ' +
        'reselling or republishing it. Check the rules on business-to-business marketing in your own ' +
        'country before a large email campaign.',
    },
  ]
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
