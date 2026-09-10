import dotenv from 'dotenv'
import { createApp } from './app.js'
import { migrate } from './db/migrate.js'
import { seed } from './db/seed.js'

dotenv.config()

const port = Number(process.env.PORT) || 4300
const host = process.env.HOST || '0.0.0.0'
const serveClient = process.env.SERVE_CLIENT === 'true'

migrate()
await seed()

const app = createApp()

app.listen(port, host, () => {
  console.log(`Kavis Pharma NPI Portal API listening on http://${host}:${port}`)
  console.log(`Local:  http://localhost:${port}`)
  console.log(serveClient ? 'Mode:   SERVE_CLIENT=true (API + client/out on one port)' : 'Dev:    Vite on :5173 + API on :' + port)
  console.log(`Health: http://localhost:${port}/api/v1/status`)
  console.log(`Login:  POST http://localhost:${port}/api/v1/login`)
})
