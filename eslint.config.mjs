import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * eslint-config-next 16 ships native flat configs, so no FlatCompat shim.
 */
const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'scripts/**', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
]

export default eslintConfig
