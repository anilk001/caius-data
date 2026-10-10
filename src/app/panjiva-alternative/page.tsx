import { ComparisonPage, comparisonMetadata } from '@/components/comparison-page'
import { findCompetitor } from '@/lib/competitors'

const competitor = findCompetitor('panjiva')!

export const metadata = comparisonMetadata(competitor)

/** The live /buyers links move only when a lane is ingested. */
export const revalidate = 86400

export default function Page() {
  return <ComparisonPage competitor={competitor} />
}
