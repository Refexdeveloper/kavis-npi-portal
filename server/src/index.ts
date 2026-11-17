import dotenv from 'dotenv'
import { createApp } from './app.js'
import { migrate } from './db/index.js'
import { seed } from './db/seed.js'
import { ensureSettings } from './services/settings.js'
import { storageLabel } from './services/storage.js'
import { mailConfigured, stageSlaDays } from './services/mail.js'
import { startNotificationScheduler } from './services/notifications.js'

dotenv.config()

const port = Number(process.env.PORT) || 4300
const host = process.env.HOST || '0.0.0.0'

await migrate()
await ensureSettings()
await seed()

const app = createApp()

app.listen(port, host, () => {
  console.log(`Kavis Pharma NPI Portal listening on http://${host}:${port}`)
  console.log(`Local:  http://localhost:${port}`)
  console.log(`Storage: ${storageLabel()}`)
  console.log(`Mail: ${mailConfigured() ? 'SMTP configured' : 'SMTP not set yet (emails logged as skipped)'}`)
  console.log(`Stage SLA: ${stageSlaDays()} days`)
  console.log(`Health: http://localhost:${port}/api/v1/status`)
  console.log(`Login:  POST http://localhost:${port}/api/v1/login`)
  startNotificationScheduler()
})
