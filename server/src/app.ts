import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import compression from 'compression'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authRequired } from './middleware/auth.js'
import { fail } from './utils/response.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import leadsRouter from './routes/leads.js'
import itemsRouter from './routes/items.js'
import documentsRouter from './routes/documents.js'
import dashboardRouter from './routes/dashboard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientOutPath = path.resolve(__dirname, '../../client/out')

export function createApp() {
  const app = express()

  const useHttps = process.env.FORCE_HTTPS === 'true'
  app.use(helmet({
    hsts: useHttps ? undefined : false,
    crossOriginOpenerPolicy: useHttps ? { policy: 'same-origin' } : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        upgradeInsecureRequests: useHttps ? [] : null,
        'font-src': ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com'],
        'style-src': ["'self'", 'https:', "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'script-src': ["'self'", "'unsafe-inline'"],
        'connect-src': ["'self'", 'http:', 'https:'],
      },
    },
  }))

  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true)
      if (/^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin)) {
        return cb(null, true)
      }
      const allowed = String(process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || '')
        .split(',').map((s) => s.trim()).filter(Boolean)
      if (allowed.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
  }))

  app.use(compression())
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '4mb' }))
  app.use(express.urlencoded({ extended: false }))
  app.use(process.env.NODE_ENV === 'production' ? morgan('combined') : morgan('dev'))

  app.get('/api/v1/status', (_req, res) => {
    res.json({
      status: 'ok',
      product: 'Kavis Pharma NPI Portal',
      version: '1.0.0',
      serve_client: process.env.SERVE_CLIENT === 'true',
      database: 'sqlite',
    })
  })

  app.use('/api/v1', authRouter)

  const api = express.Router()
  api.use(authRequired)
  api.use('/users', usersRouter)
  api.use('/dashboard', dashboardRouter)
  api.use('/documents', documentsRouter)
  api.use('/leads', leadsRouter)
  api.use('/leads', itemsRouter) // adds nested /leads/:id/gates/... item actions + /leads/:id/history
  app.use('/api/v1', api)

  const shouldServeClient = process.env.SERVE_CLIENT === 'true'
  if (shouldServeClient && fs.existsSync(clientOutPath)) {
    console.log('Serving production client from:', clientOutPath)
    app.use(express.static(clientOutPath, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase()
        const oneYear = 31536000
        if (['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.woff', '.woff2'].includes(ext)) {
          res.setHeader('Cache-Control', `public, max-age=${oneYear}, immutable`)
        } else if (ext === '.html') {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
        }
      },
    }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if ((req.path || '').startsWith('/api')) return next()
      return res.sendFile(path.join(clientOutPath, 'index.html'))
    })
  } else if (shouldServeClient) {
    console.warn('SERVE_CLIENT=true but client/out not found — run: cd client && npm run build')
  } else {
    app.get('/', (req, res) => {
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
      const host = req.get('host')
      res.json({
        message: 'Kavis Pharma NPI Portal API is running',
        mode: process.env.NODE_ENV || 'development',
        apiUrl: `${protocol}://${host}/api/v1`,
        note: 'Set SERVE_CLIENT=true and build client/out to serve the UI from this process, or run the client dev server separately.',
      })
    })
  }

  app.use((_req, res) => fail(res, 'Not found', 404))
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    return fail(res, err.message || 'Server error', 500)
  })

  return app
}
