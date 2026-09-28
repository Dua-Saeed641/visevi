import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { env } from './env.js'
import { connectMongo } from './lib/mongo.js'
import { assetsRouter } from './routes/assets.js'
import { healthRouter } from './routes/health.js'

async function main() {
  // Connect before accepting requests — fail loudly at startup rather than
  // on the first request if MongoDB is unreachable or the URI is wrong.
  await connectMongo()
  console.log('Connected to MongoDB')

  const app = express()

  app.use(cors({ origin: env.corsOrigin }))
  app.use(express.json())

  app.use('/api/health', healthRouter)
  app.use('/api/assets', assetsRouter)

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
  app.use(errorHandler)

  app.listen(env.port, () => {
    console.log(`VisEvi API listening on http://localhost:${env.port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
