/**
 * Ready-made sector packs for the front of the shop.
 *
 * A visitor who has never heard of Caius does not arrive knowing an HS
 * heading. These give them a door in: pick the sector you export, see how many
 * US buyers we hold, buy the list.
 *
 * Definitions only — no counts. Every count a customer sees is read from the
 * database at render time by `src/app/packs/page.tsx`, never written here.
 * A hard-coded "500 importers" that delivers 380 is the fastest route to a
 * refund and a bad review, and the rule that a pack of 50 means 50 separate
 * companies applies just as much to the number on the tile.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

export interface PromoPack {
  /** URL segment and React key. */
  slug: string
  title: string
  /** One line naming what an exporter in this sector actually sells. */
  blurb: string
  /** The HS4 headings this pack searches. Order is the order shown. */
  hs4: string[]
}

/**
 * The launch sectors, in the order they appear on the page.
 *
 * India's biggest goods exports to the United States, which is the lane the
 * whole product is built around. Each heading is a real HS4 chapter+heading —
 * they go straight into the same search the buyer would have typed themselves.
 */
export const PROMO_PACKS: PromoPack[] = [
  {
    slug: 'garments',
    title: 'Garments & textiles',
    blurb: "Dresses, shirts, trousers, knitwear, bed and table linen.",
    hs4: ['6204', '6203', '6109', '6110', '6205', '6206', '6302'],
  },
  {
    slug: 'spices',
    title: 'Spices & agri',
    blurb: 'Pepper, chilli, turmeric, ginger, cumin, coriander, cashews.',
    hs4: ['0904', '0910', '0909', '0906', '0908', '0801'],
  },
  {
    slug: 'leather',
    title: 'Leather goods',
    blurb: 'Handbags, wallets, cases, belts and leather apparel.',
    hs4: ['4202', '4203', '4205', '6403'],
  },
  {
    slug: 'pharmaceuticals',
    title: 'Pharmaceuticals',
    blurb: 'Formulations, bulk drugs and active pharmaceutical ingredients.',
    hs4: ['3004', '3003', '2933', '2942'],
  },
  {
    slug: 'gems-jewellery',
    title: 'Gems & jewellery',
    blurb: 'Gold and silver jewellery, cut stones, imitation jewellery.',
    hs4: ['7113', '7117', '7102', '7103'],
  },
  {
    slug: 'engineering',
    title: 'Engineering goods',
    blurb: 'Wire and cable, switchgear, fasteners, machine parts.',
    hs4: ['8544', '8536', '7318', '8481'],
  },
]

export function findPromoPack(slug: string): PromoPack | null {
  return PROMO_PACKS.find((pack) => pack.slug === slug) ?? null
}

/** The `hs4` query value that reproduces a pack in the search page. */
export function packSearchHref(pack: PromoPack): string {
  return `/search?hs4=${pack.hs4.join(',')}`
}
