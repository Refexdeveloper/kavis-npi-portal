import { migrate, closePool } from './index.js'

export { migrate }

const isDirect = process.argv[1]?.includes('migrate')
if (isDirect) {
  migrate()
    .then(async () => {
      await closePool()
      process.exit(0)
    })
    .catch(async (err) => {
      console.error('[migrate] failed:', err)
      await closePool().catch(() => {})
      process.exit(1)
    })
}
